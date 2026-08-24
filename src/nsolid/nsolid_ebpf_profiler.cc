#include "nsolid_ebpf_profiler.h"
#include "util.h"
#include "nsolid_api.h"


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

namespace node {
namespace nsolid {

namespace {

constexpr uint32_t kSampleFrequencyHz = 99;

}  // namespace

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
  attr.exclude_kernel = 1;
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

void EBPFProfiler::process_event(void*, size_t) {}

}  // namespace nsolid
}  // namespace node
