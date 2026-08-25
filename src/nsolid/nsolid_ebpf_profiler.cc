#include "nsolid_ebpf_profiler.h"
#include "util.h"
#include "nsolid_api.h"
#include "debug_utils-inl.h"


#include <errno.h>
#include <fcntl.h>
#include <linux/perf_event.h>
#include <sys/ioctl.h>
#include <sys/syscall.h>
#include <unistd.h>

#include <unordered_map>

#include "bpf.h"
#include "libbpf.h"

#include "nsolid_bpf.h"
#include "ebpf/profiler/profiler.h"

#define NANOS_PER_SEC 1000000000

namespace node {
namespace nsolid {

template <typename... Args>
inline void Debug(Args&&... args) {
  per_process::Debug(DebugCategory::NSOLID_EBPF, std::forward<Args>(args)...);
}

constexpr uint32_t kSampleFrequencyHz = 99;
constexpr uint64_t kV8CodeReorderSlackNs = 50 * 1000 * 1000;
constexpr uint64_t kV8CodeClosedRetentionNs = 2 * NANOS_PER_SEC;

void EBPFProfiler::evict_closed_v8_code_symbols(uint64_t min_valid_to_ts) {
  EnvList* envlist = EnvList::Inst();
  decltype(envlist->env_map_) env_map;
  {
    nsuv::ns_mutex::scoped_lock lock(envlist->map_lock_);
    env_map = envlist->env_map_;
  }

  for (auto& entry : env_map)
    entry.second->EvictClosedV8CodeSymbols(min_valid_to_ts);
}

EBPFProfiler::EBPFProfiler(uv_loop_t* loop) : loop_(loop), pid_(getpid()) {
  CHECK_EQ(thread_to_perf_fd_map_lock_.init(true), 0);
}

EBPFProfiler::~EBPFProfiler() {
  // EnvList closes loop handles before releasing its owning reference.
  CHECK_NULL(ebpf_stack_flush_timer_);
  CHECK_NULL(ring_buffer_poll_);
  CHECK_NULL(rb_);
  CHECK_NULL(skel_);
}

void EBPFProfiler::Initialize() {
  DCHECK(utils::are_threads_equal(uv_thread_self(), EnvList::Inst()->thread()));
  ebpf_stack_flush_timer_ = new nsuv::ns_timer();
  CHECK_EQ(0, ebpf_stack_flush_timer_->init(loop_));
  ebpf_stack_flush_timer_->set_data(this);
  ebpf_stack_flush_timer_->unref();
}

bool EBPFProfiler::Enable() {
  DCHECK(utils::are_threads_equal(uv_thread_self(), EnvList::Inst()->thread()));
  if (rb_ != nullptr)
    return true;
  if (enable())
    return true;
  Disable();
  return false;
}

void EBPFProfiler::Disable() {
  DCHECK(utils::are_threads_equal(uv_thread_self(), EnvList::Inst()->thread()));
  CHECK_EQ(ebpf_stack_flush_timer_->stop(), 0);
  pending_ebpf_stacks_.clear();
  {
    nsuv::ns_mutex::scoped_lock lock(thread_to_perf_fd_map_lock_);
    for (const auto& event : thread_to_perf_fd_map_)
      close(event.second);
    thread_to_perf_fd_map_.clear();
  }
  if (ring_buffer_poll_ != nullptr) {
    ring_buffer_poll_->close_and_delete();
    ring_buffer_poll_ = nullptr;
  }
  if (rb_ != nullptr) {
    ring_buffer__free(rb_);
    rb_ = nullptr;
  }
  if (skel_ != nullptr) {
    profiler_bpf__destroy(skel_);
    skel_ = nullptr;
  }
  prog_ = nullptr;
  ring_buffer_fd_ = -1;
  mappings_ = Mappings{};
}

void EBPFProfiler::shutdown() {
  Disable();
  ebpf_stack_flush_timer_->close_and_delete();
  ebpf_stack_flush_timer_ = nullptr;
}

bool EBPFProfiler::IsSupported() {
  EbpfLoadStatus status;
  profiler_bpf* skel = EbpfLoader::LoadProfiler(status);
  if (skel == nullptr)
    return false;
  profiler_bpf__destroy(skel);
  return true;
}

bool EBPFProfiler::enable() {
  EbpfLoadStatus status;
  skel_ = EbpfLoader::LoadProfiler(status);
  if (skel_ == nullptr)
    return false;
  ProcessMemoryMappings::Read(static_cast<pid_t>(pid_), &mappings_);

  prog_ = bpf_object__find_program_by_name(skel_->obj,
                                               "on_cpu_sample");
  bpf_map* ring_buffer_map = bpf_object__find_map_by_name(skel_->obj,
                                                           "rb");
  if (prog_ == nullptr || ring_buffer_map == nullptr)
    return false;

  ring_buffer_fd_ = bpf_map__fd(ring_buffer_map);
  if (!AddThread(pid_))
    return false;
  return init_ring_buffer();
}

bool EBPFProfiler::init_ring_buffer() {
  rb_ = ring_buffer__new(ring_buffer_fd_, handle_event, this, nullptr);
  if (rb_ == nullptr)
    return false;

  ring_buffer_poll_ = new nsuv::ns_poll();
  if (ring_buffer_poll_->init(loop_, ring_buffer_fd_) != 0)
    return false;
  return ring_buffer_poll_->start(
             UV_READABLE, handle_poll_cb, weak_from_this()) == 0;
}


void EBPFProfiler::RemoveThread(uint64_t tid) {
  nsuv::ns_mutex::scoped_lock lock(thread_to_perf_fd_map_lock_);
  auto it = thread_to_perf_fd_map_.find(tid);
  if (it == thread_to_perf_fd_map_.end())
    return;
  close(it->second);
  thread_to_perf_fd_map_.erase(it);
}

bool EBPFProfiler::AddThread(uint64_t tid) {
  nsuv::ns_mutex::scoped_lock lock(thread_to_perf_fd_map_lock_);
  if (thread_to_perf_fd_map_.find(tid) != thread_to_perf_fd_map_.end())
    return true;
  perf_event_attr attr = {};
  attr.type = PERF_TYPE_SOFTWARE;
  attr.config = PERF_COUNT_SW_CPU_CLOCK;
  attr.size = sizeof(attr);
  attr.freq = 1;
  attr.sample_freq = kSampleFrequencyHz;
  attr.exclude_kernel = 0;
  attr.exclude_hv = 1;

  int fd = syscall(__NR_perf_event_open, &attr, static_cast<pid_t>(tid), -1,
                   -1, PERF_FLAG_FD_CLOEXEC);
  if (fd < 0 || ioctl(fd, PERF_EVENT_IOC_SET_BPF,
                      bpf_program__fd(prog_)) < 0) {
    if (fd >= 0)
      close(fd);
    return false;
  }
  if (ioctl(fd, PERF_EVENT_IOC_ENABLE, 0) < 0) {
    close(fd);
    return false;
  }
  thread_to_perf_fd_map_.emplace(tid, fd);
  return true;
}

int EBPFProfiler::handle_event(void* ctx, void* data, size_t data_size) {
  static_cast<EBPFProfiler*>(ctx)->process_event(data, data_size);
  return 0;
}

void EBPFProfiler::handle_poll_cb(nsuv::ns_poll*,
                                  int status,
                                  int events,
                                  WeakEBPFProfiler weak_profiler) {
  auto profiler = weak_profiler.lock();
  if (profiler == nullptr || status < 0 || !(events & UV_READABLE))
    return;
  ring_buffer__consume(profiler->rb_);
}

void EBPFProfiler::process_event(void* data, size_t data_size) {
  if (data == nullptr || data_size < sizeof(profiler_event))
    return;

  auto* event = static_cast<profiler_event*>(data);
  if (event->type == EVENT_STACK_TRACE)
    process_stack_trace(data, data_size);
}

void EBPFProfiler::process_stack_trace(void* data, size_t data_size) {
  auto* event = static_cast<profiler_event*>(data);
  if (event->stack_trace.user_stack_depth <= 0 ||
      event->stack_trace.user_stack_depth > MAX_STACK_FRAMES ||
      data_size < sizeof(profiler_event))
    return;

  Stack stack(event->stack_trace.user_stack_depth);
  stack.timestamp = event->timestamp;
  stack.tid = event->tid;
  SharedEnvInst envinst = EnvInst::GetInstByOsThreadId(stack.tid);
  if (envinst != nullptr)
    stack.node_thread_id = envinst->thread_id();
  const AddressRange empty_range;
  const AddressRange& code_range =
    envinst ? envinst->code_range() : empty_range;
  size_t v8_jit_frames = 0;
  size_t native_frames = 0;
  size_t unknown_frames = 0;
  for (size_t i = 0; i < stack.frames.size(); ++i) {
    const Mapping* mapping = nullptr;
    stack.frames[i].addr = event->stack_trace.user_stack[i];
    stack.frames[i].kind =
        ClassifyFrame(stack.frames[i].addr, code_range, mappings_, mapping);
    switch (stack.frames[i].kind) {
      case FrameKind::kV8Jit:
        ++v8_jit_frames;
        break;
      case FrameKind::kNativeMapped:
        ++native_frames;
        break;
      default:
        ++unknown_frames;
        break;
    }

    PopulateNativeFrameInfo(&stack.frames[i], mappings_, mapping);
  }

  Debug("EBPF stack classify tid=%u depth=%zu v8_jit=%zu"
        "native=%zu unknown=%zu\n",
        stack.tid, stack.frames.size(), v8_jit_frames, native_frames,
        unknown_frames);

  QueueEBPFStack(std::move(stack));
}

void EBPFProfiler::OnCodeEvent(uint64_t now_ns) {
  DCHECK(utils::are_threads_equal(uv_thread_self(), EnvList::Inst()->thread()));
  flush_pending_ebpf_stacks(now_ns);
}

void EBPFProfiler::QueueEBPFStack(Stack&& stack) {
  DCHECK(utils::are_threads_equal(uv_thread_self(), EnvList::Inst()->thread()));
  pending_ebpf_stacks_.push_back({ std::move(stack) });
  uint64_t now_ns = uv_hrtime();
  flush_pending_ebpf_stacks(now_ns);
  schedule_ebpf_stack_flush(now_ns);
}

void EBPFProfiler::schedule_ebpf_stack_flush(uint64_t now_ns) {
  if (pending_ebpf_stacks_.empty())
    return;

  uint64_t due_ns = pending_ebpf_stacks_.front().stack.timestamp +
                    kV8CodeReorderSlackNs;
  uint64_t timeout_ns = due_ns > now_ns ? due_ns - now_ns : 0;
  uint64_t timeout_ms = timeout_ns == 0 ? 0 : (timeout_ns + 999999) / 1000000;
  int er = ebpf_stack_flush_timer_->start(ebpf_stack_flush_timer_cb_,
                                          timeout_ms,
                                          0);
  CHECK_EQ(er, 0);
}


void EBPFProfiler::flush_pending_ebpf_stacks(uint64_t now_ns) {
  uint64_t finalize_before =
    now_ns > kV8CodeReorderSlackNs ? now_ns - kV8CodeReorderSlackNs : 0;

  while (!pending_ebpf_stacks_.empty() &&
         pending_ebpf_stacks_.front().stack.timestamp <= finalize_before) {
    Stack stack = std::move(pending_ebpf_stacks_.front().stack);
    pending_ebpf_stacks_.pop_front();

    SharedEnvInst envinst_sp = EnvInst::GetInstByOsThreadId(stack.tid);
    size_t resolved_v8_jit = 0;
    size_t unresolved_v8_jit = 0;
    if (envinst_sp != nullptr) {
      for (auto& frame : stack.frames) {
        if (frame.kind == FrameKind::kV8Jit) {
          bool resolved = envinst_sp->ResolveV8CodeSymbol(frame.addr,
                                                          stack.timestamp,
                                                          &frame);
          if (resolved) {
            ++resolved_v8_jit;
          } else {
            ++unresolved_v8_jit;
          }
        }
      }
    }

    per_process::Debug(DebugCategory::NSOLID_EBPF,
      "EBPF stack resolve tid=%u ts=%llu resolved_v8_jit=%zu"
      "unresolved_v8_jit=%zu env=%s\n",
      stack.tid,
      static_cast<uint64_t>(stack.timestamp),
      resolved_v8_jit,
      unresolved_v8_jit,
      envinst_sp != nullptr ? "yes" : "no");
    DispatchStackTrace(std::move(stack));
  }

  uint64_t min_valid_to_ts = pending_ebpf_stacks_.empty() ?
      (now_ns > kV8CodeClosedRetentionNs ?
       now_ns - kV8CodeClosedRetentionNs : 0) :
      pending_ebpf_stacks_.front().stack.timestamp;
  evict_closed_v8_code_symbols(min_valid_to_ts);
}

void EBPFProfiler::ebpf_stack_flush_timer_cb_(nsuv::ns_timer* timer) {
  auto* profiler = timer->get_data<EBPFProfiler>();
  if (profiler == nullptr)
    return;

  uint64_t now_ns = uv_hrtime();
  profiler->flush_pending_ebpf_stacks(now_ns);
  profiler->schedule_ebpf_stack_flush(now_ns);
}

void EBPFProfiler::DispatchStackTrace(Stack&& stack) {
  stack_trace_hooks_.for_each([&](const StackTraceHookFnHolder& holder,
                                  size_t size) {
    if (size == 1) {
      holder.fn(std::move(stack));
    } else {
      holder.fn(stack);
    }
  });
}

void StackHook::Dispose() {
  if (disposed_)
    return;
  if (auto profiler = profiler_.lock())
    profiler->stack_trace_hooks_.erase(it_);
  disposed_ = true;
}

}  // namespace nsolid
}  // namespace node
