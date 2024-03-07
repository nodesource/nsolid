#include "nsolid.h"
#include "nsolid/nsolid_api.h"
#include "nsolid/nsolid_trace.h"
#include "nsolid/nsolid_util.h"
#include "nsolid/nsolid_cpu_profiler.h"
#include "nsolid/nsolid_heap_snapshot.h"

#include "env-inl.h"
#include "memory_tracker-inl.h"
#include "node_perf.h"
#include "util.h"
#include "uv.h"

#include <chrono> // NOLINT [build/c++11]
#include <cmath>
#include <memory>

#define MICROS_PER_SEC 1000000
#define NANOS_PER_SEC 1000000000

namespace node {
namespace nsolid {

using std::chrono::duration_cast;
using std::chrono::milliseconds;
using std::chrono::system_clock;
using v8::Isolate;

static bool isnan(double d) { return std::isnan(d); }
static bool isnan(uint64_t) { return false; }


SharedEnvInst GetEnvInst(uint64_t thread_id) {
  return EnvInst::GetInst(thread_id);
}


SharedEnvInst GetLocalEnvInst(v8::Local<v8::Context> context) {
  return EnvInst::GetCurrent(context);
}

SharedEnvInst GetLocalEnvInst(v8::Isolate* isolate) {
  return EnvInst::GetCurrent(isolate);
}

SharedEnvInst GetMainEnvInst() {
  return EnvInst::GetInst(EnvList::Inst()->main_thread_id());
}


uint64_t GetThreadId(SharedEnvInst envinst_sp) {
  // Make sure a valid instance has been passed.
  if (envinst_sp == nullptr)
    return UINT64_MAX;
  // Not going to scope lock here since it'd be a race condition anyways calling
  // any other API that uses SharedEnvInst, and other APIs that actually
  // operate on the SharedEnvInst might need to scope lock.
  return envinst_sp->thread_id();
}


uint64_t ThreadId(v8::Local<v8::Context> context) {
  SharedEnvInst envinst_sp = GetLocalEnvInst(context);

  // This is an expensive check, so only do it in a debug build since users
  // should know this is not a thread-safe call.
#if defined(DEBUG)
  if (!IsEnvInstCreationThread(envinst_sp))
    return UINT64_MAX;
#endif

  return envinst_sp->thread_id();
}


bool IsEnvInstCreationThread(SharedEnvInst envinst) {
  if (envinst == nullptr)
    return false;

  uv_thread_t self = uv_thread_self();
  const uv_thread_t& creation_thread = envinst->creation_thread();
  return uv_thread_equal(&self, &creation_thread);
}


bool IsMainThread(SharedEnvInst envinst) {
  if (envinst == nullptr)
    return false;

  return envinst->is_main_thread();
}


int GetStartupTimes(SharedEnvInst envinst_sp, std::string* times) {
  if (envinst_sp == nullptr)
    return UV_ESRCH;
  *times = envinst_sp->GetStartupTimes();
  return 0;
}


ns_error_tp* GetExitError() {
  return EnvList::Inst()->GetExitError();
}


int GetExitCode() {
  return EnvList::Inst()->GetExitCode();
}


std::string GetProcessInfo() {
  return EnvList::Inst()->GetInfo();
}


std::string GetAgentId() {
  return EnvList::Inst()->AgentId();
}


void UpdateConfig(const std::string& config) {
  EnvList::Inst()->UpdateConfig(config);
}


std::string GetConfig() {
  return EnvList::Inst()->CurrentConfig();
}


static int get_cpu_usage(uint64_t* fields, uv_rusage_t* ru = nullptr) {
  uv_rusage_t rusage;
  int er;

  if (ru == nullptr) {
    er = uv_getrusage(&rusage);
    if (er)
      return er;
    ru = &rusage;
  }

  fields[0] = MICROS_PER_SEC * ru->ru_utime.tv_sec + ru->ru_utime.tv_usec;
  fields[1] = MICROS_PER_SEC * ru->ru_stime.tv_sec + ru->ru_stime.tv_usec;
  fields[2] = fields[0] + fields[1];

  return 0;
}


ProcessMetrics::ProcessMetrics() : cpu_prev_time_(uv_hrtime()) {
  int er = get_cpu_usage(cpu_prev_);
  CHECK_EQ(er, 0);
  CHECK_EQ(uv_mutex_init(&stor_lock_), 0);
}


ProcessMetrics::~ProcessMetrics() {
  uv_mutex_destroy(&stor_lock_);
}


std::string ProcessMetrics::toJSON() {
  std::string metrics_string;

  uv_mutex_lock(&stor_lock_);
  metrics_string += "{";
#define V(Type, CName, JSName, MType, Unit)                                    \
  metrics_string += "\"" #JSName "\":";                                        \
  metrics_string += nlohmann::json(stor_.CName).dump();                        \
  metrics_string += ",";
  NSOLID_PROCESS_METRICS_STRINGS(V)
#undef V
#define V(Type, CName, JSName, MType, Unit)                                    \
  metrics_string += "\"" #JSName "\":";                                        \
  metrics_string += std::to_string(stor_.CName);                               \
  metrics_string += ",";
  NSOLID_PROCESS_METRICS_NUMBERS(V)
#undef V
  metrics_string += "\"cpu\":";
  metrics_string += std::to_string(stor_.cpu_percent);
  metrics_string += "}";
  uv_mutex_unlock(&stor_lock_);

  return metrics_string;
}


ProcessMetrics::MetricsStor ProcessMetrics::Get() {
  uv_mutex_lock(&stor_lock_);
  auto stor = stor_;
  uv_mutex_unlock(&stor_lock_);
  return stor;
}


int ProcessMetrics::Update() {
  uv_rusage_t rusage;
  uv_passwd_t pwd;
  uint64_t cpu[3];
  uint64_t now;
  uint64_t elapsed;
  double load_avgs[3];
  double cpu_percent[3];
  double system_uptime;
  char title_buf[512];
  size_t rss;
  int er;

  uv_loadavg(load_avgs);
  er = uv_get_process_title(title_buf, sizeof(title_buf));
  if (er)
    return er;
  er = uv_resident_set_memory(&rss);
  if (er)
    return er;
  er = uv_uptime(&system_uptime);
  if (er)
    return er;
  er = uv_getrusage(&rusage);
  if (er)
    return er;
  now = uv_hrtime();
  elapsed = now - cpu_prev_time_;
  er = get_cpu_usage(cpu, &rusage);
  if (er)
    return er;
  er = uv_os_get_passwd(&pwd);
  if (er)
    return er;
  auto free_passwd = OnScopeLeave([&]() { uv_os_free_passwd(&pwd); });

  cpu_percent[0] = (cpu[0] - cpu_prev_[0]) * 100.0 * 1000.0 / elapsed;
  cpu_percent[1] = (cpu[1] - cpu_prev_[1]) * 100.0 * 1000.0 / elapsed;
  cpu_percent[2] = (cpu[2] - cpu_prev_[2]) * 100.0 * 1000.0 / elapsed;

  uv_mutex_lock(&stor_lock_);
  stor_.title = title_buf;
  stor_.user = pwd.username;
  stor_.timestamp = duration_cast<milliseconds>(
    system_clock::now().time_since_epoch()).count();
  stor_.uptime =
    (uv_hrtime() - node::per_process::node_start_time) / NANOS_PER_SEC;
  stor_.system_uptime = static_cast<uint64_t>(system_uptime);
  stor_.free_mem = uv_get_free_memory();
  stor_.block_input_op_count = rusage.ru_inblock;
  stor_.block_output_op_count = rusage.ru_oublock;
  stor_.ctx_switch_involuntary_count = rusage.ru_nivcsw;
  stor_.ctx_switch_voluntary_count = rusage.ru_nvcsw;
  stor_.ipc_received_count = rusage.ru_msgrcv;
  stor_.ipc_sent_count = rusage.ru_msgsnd;
  stor_.page_fault_hard_count = rusage.ru_majflt;
  stor_.page_fault_soft_count = rusage.ru_minflt;
  stor_.signal_count = rusage.ru_nsignals;
  stor_.swap_count = rusage.ru_nswap;
  stor_.rss = rss;
  stor_.load_1m = load_avgs[0];
  stor_.load_5m = load_avgs[1];
  stor_.load_15m = load_avgs[2];
  stor_.cpu_user_percent = cpu_percent[0];
  stor_.cpu_system_percent = cpu_percent[1];
  stor_.cpu_percent = cpu_percent[2];
  stor_.cpu = stor_.cpu_percent;
  uv_mutex_unlock(&stor_lock_);

  cpu_prev_[0] = cpu[0];
  cpu_prev_[1] = cpu[1];
  cpu_prev_[2] = cpu[2];
  cpu_prev_time_ = now;

  return 0;
}


ThreadMetrics::ThreadMetrics(SharedEnvInst envinst)
    : thread_id_(envinst->thread_id()),
      user_data_(nullptr, nullptr) {
  CHECK_NOT_NULL(envinst.get());
  CHECK_EQ(uv_mutex_init(&stor_lock_), 0);
  stor_.thread_id = thread_id_;
  stor_.prev_call_time_ = uv_hrtime();
  stor_.current_hrtime_ = stor_.prev_call_time_;
}


ThreadMetrics::~ThreadMetrics() {
  uv_mutex_destroy(&stor_lock_);
}


ThreadMetrics::ThreadMetrics(uint64_t thread_id)
    : thread_id_(thread_id),
      user_data_(nullptr, nullptr) {
  CHECK_EQ(uv_mutex_init(&stor_lock_), 0);
  stor_.thread_id = thread_id_;
  stor_.prev_call_time_ = uv_hrtime();
  stor_.current_hrtime_ = stor_.prev_call_time_;
}


SharedThreadMetrics ThreadMetrics::Create(SharedEnvInst envinst) {
  return SharedThreadMetrics(new ThreadMetrics(envinst), [](ThreadMetrics* tm) {
    delete tm;
  });
}


std::string ThreadMetrics::toJSON() {
  MetricsStor dup;
  std::string metrics_string;

  uv_mutex_lock(&stor_lock_);
  dup = stor_;
  uv_mutex_unlock(&stor_lock_);

  metrics_string += "{";
#define V(Type, CName, JSName, MType, Unit)                                    \
  metrics_string += "\"" #JSName "\":\"";                                      \
  metrics_string += dup.CName;                                                 \
  metrics_string += "\",";
  NSOLID_ENV_METRICS_STRINGS(V)
#undef V
#define V(Type, CName, JSName, MType, Unit)                                    \
  metrics_string += "\"" #JSName "\":";                                        \
  metrics_string += isnan(dup.CName) ?                                         \
      "null" : std::to_string(dup.CName);                                      \
  metrics_string += ",";
  NSOLID_ENV_METRICS_NUMBERS(V)
#undef V
  metrics_string.pop_back();
  metrics_string += "}";

  return metrics_string;
}


ThreadMetrics::MetricsStor ThreadMetrics::Get() {
  uv_mutex_lock(&stor_lock_);
  auto s = stor_;
  uv_mutex_unlock(&stor_lock_);
  return s;
}


int ThreadMetrics::Update(v8::Isolate* isolate) {
  SharedEnvInst envinst = GetLocalEnvInst(isolate);

  if (envinst == nullptr || envinst->thread_id() != thread_id_) {
    return UV_ESRCH;
  }
  // An async update request is currently in process. Let that complete before
  // running Update() again.
  if (update_running_) {
    return UV_EBUSY;
  }

  uv_mutex_lock(&stor_lock_);
  envinst->GetThreadMetrics(&stor_);
  uv_mutex_unlock(&stor_lock_);

  return 0;
}


int ThreadMetrics::get_thread_metrics_() {
  // Might need to fire myself for using nested lambdas.
  auto cb = [](SharedEnvInst ei, std::weak_ptr<ThreadMetrics> wp) {
    // This runs from the worker thread.
    auto ret_proxy = [](std::weak_ptr<ThreadMetrics> wp) {
      // This runs from the NSolid thread.
      SharedThreadMetrics tm_sp = wp.lock();
      if (tm_sp == nullptr) {
        return;
      }

      tm_sp->proxy_(tm_sp);
    };

    SharedThreadMetrics tm_sp = wp.lock();
    if (tm_sp == nullptr) {
      return;
    }

    uv_mutex_lock(&tm_sp->stor_lock_);
    ei->GetThreadMetrics(&tm_sp->stor_);
    uv_mutex_unlock(&tm_sp->stor_lock_);

    QueueCallback(ret_proxy, tm_sp);
  };

  std::weak_ptr<ThreadMetrics> wp = weak_from_this();
  DCHECK(!wp.expired());
  return RunCommand(GetEnvInst(thread_id_), CommandType::Interrupt, cb, wp);
}


void ThreadMetrics::reset() {
  proxy_ = nullptr;
  update_running_ = false;
}


class MetricsStream::Impl {
 public:
  Impl() = default;
  ~Impl() {
    EnvList::Inst()->RemoveMetricsStreamHook(hook_);
  }

 private:
  void Setup(uint32_t flags,
             MetricsStream* stream,
             metrics_stream_proxy_sig cb,
             internal::deleter_sig deleter,
             void* data) {
    hook_ = EnvList::Inst()->AddMetricsStreamHook(flags,
                                                  stream,
                                                  cb,
                                                  deleter,
                                                  data);
  }

  friend class MetricsStream;
  TSList<EnvList::MetricsStreamHookStor>::iterator hook_;
};


MetricsStream::MetricsStream(): impl_(std::make_unique<Impl>()) {
}


MetricsStream::~MetricsStream() = default;

void MetricsStream::DoSetup(uint32_t flags,
                            metrics_stream_proxy_sig cb,
                            internal::deleter_sig deleter,
                            void* data) {
  impl_->Setup(flags, this, cb, deleter, data);
}


class Tracer::Impl {
 public:
  Impl() = default;
  ~Impl() {
    auto tracer = EnvList::Inst()->GetTracer();
    tracer->removeHook(hook_);
  }

 private:
  friend class Tracer;
  void Setup(uint32_t flags,
             Tracer* tracer,
             tracer_proxy_sig cb,
             void(*deleter)(void*),
             void* data) {
    hook_ = EnvList::Inst()->GetTracer()->addHook(flags,
                                                  tracer,
                                                  data,
                                                  cb,
                                                  deleter);
  }

  TSList<tracing::TracerImpl::TraceHookStor>::iterator hook_;
};

Tracer::Tracer(): impl_(std::make_unique<Impl>()) {
}

Tracer::~Tracer() = default;

void Tracer::DoSetup(uint32_t flags,
                     tracer_proxy_sig cb,
                     internal::deleter_sig deleter,
                     void* data) {
  impl_->Setup(flags, this, cb, deleter, data);
}


int ModuleInfo(SharedEnvInst envinst_sp, std::string* json) {
  if (envinst_sp == nullptr)
    return UV_ESRCH;

  // This call is thread safe since we are holding a reference to the shared_ptr
  // and a lock is performed within GetModuleInfo.
  *json = envinst_sp->GetModuleInfo();
  return 0;
}


int CpuProfiler::StopProfile(SharedEnvInst envinst) {
  if (envinst == nullptr)
    return UV_ESRCH;

  return NSolidCpuProfiler::Inst()->StopProfiling(envinst);
}

int CpuProfiler::StopProfileSync(SharedEnvInst envinst) {
  if (envinst == nullptr)
    return UV_ESRCH;

  if (!IsEnvInstCreationThread(envinst))
    return UV_EINVAL;

  return NSolidCpuProfiler::Inst()->StopProfilingSync(envinst);
}


int CpuProfiler::get_cpu_profile_(SharedEnvInst envinst,
                                  uint64_t duration,
                                  void* data,
                                  cpu_profiler_proxy_sig proxy,
                                  internal::deleter_sig deleter) {
  if (envinst == nullptr)
    return UV_ESRCH;

  return NSolidCpuProfiler::Inst()->TakeCpuProfile(envinst,
                                                   duration,
                                                   data,
                                                   proxy,
                                                   deleter);
}

int Snapshot::start_allocation_sampling_(SharedEnvInst envinst,
                                         uint64_t sample_interval,
                                         int stack_depth,
                                         v8::HeapProfiler::SamplingFlags flags,
                                         uint64_t duration,
                                         internal::user_data data,
                                         snapshot_proxy_sig proxy) {
  return EnvList::Inst()->HeapSnapshot()->StartSamplingProfiler(
      envinst,
      sample_interval,
      stack_depth,
      flags,
      duration,
      std::move(data),
      proxy);
}

int Snapshot::StopSampling(SharedEnvInst envinst) {
  if (envinst == nullptr)
    return UV_ESRCH;

  return EnvList::Inst()->HeapSnapshot()->StopSamplingProfiler(envinst);
}

int Snapshot::StopSamplingSync(SharedEnvInst envinst) {
  if (envinst == nullptr)
    return UV_ESRCH;

  return EnvList::Inst()->HeapSnapshot()->StopSamplingProfilerSync(envinst);
}


int Snapshot::start_tracking_heap_objects_(SharedEnvInst envinst,
                                           bool redacted,
                                           bool track_allocations,
                                           uint64_t duration,
                                           internal::user_data data,
                                           snapshot_proxy_sig proxy) {
  return EnvList::Inst()->HeapSnapshot()->StartTrackingHeapObjects(
      envinst, redacted, track_allocations, duration, std::move(data), proxy);
}

int Snapshot::StopTrackingHeapObjects(SharedEnvInst envinst) {
  if (envinst == nullptr)
    return UV_ESRCH;

  return EnvList::Inst()->HeapSnapshot()->StopTrackingHeapObjects(envinst);
}

int Snapshot::StopTrackingHeapObjectsSync(SharedEnvInst envinst) {
  if (envinst == nullptr)
    return UV_ESRCH;

  return EnvList::Inst()->HeapSnapshot()->StopTrackingHeapObjectsSync(envinst);
}

int Snapshot::get_snapshot_(SharedEnvInst envinst,
                            bool redacted,
                            void* data,
                            snapshot_proxy_sig proxy,
                            internal::deleter_sig deleter) {
  if (envinst == nullptr)
    return UV_ESRCH;

  return EnvList::Inst()->HeapSnapshot()->
    GetHeapSnapshot(envinst, redacted, data, proxy, deleter);
}


namespace internal {

void on_block_loop_hook_(uint64_t threshold,
                         void* data,
                         on_block_loop_hook_proxy_sig proxy,
                         deleter_sig del) {
  EnvList::Inst()->OnBlockedLoopHook(threshold, data, proxy, del);
}

void on_unblock_loop_hook_(void* data,
                           on_unblock_loop_hook_proxy_sig proxy,
                           deleter_sig del) {
  EnvList::Inst()->OnUnblockedLoopHook(data, proxy, del);
}

void on_configuration_hook_(void* data,
                            on_configuration_hook_proxy_sig proxy,
                            deleter_sig deleter) {
  EnvList::Inst()->OnConfigurationHook(data, proxy, deleter);
}

void thread_added_hook_(void* data,
                        thread_added_hook_proxy_sig proxy,
                        deleter_sig deleter) {
  EnvList::Inst()->EnvironmentCreationHook(data, proxy, deleter);
}

void thread_removed_hook_(void* data,
                          thread_removed_hook_proxy_sig proxy,
                          deleter_sig deleter) {
  EnvList::Inst()->EnvironmentDeletionHook(data, proxy, deleter);
}


int queue_callback_(void* data, queue_callback_proxy_sig proxy) {
  return EnvList::Inst()->QueueCallback(proxy, data);
}

int queue_callback_(uint64_t timeout,
                    void* data,
                    queue_callback_proxy_sig proxy) {
  return EnvList::Inst()->QueueCallback(proxy, timeout, data);
}


int run_command_(SharedEnvInst envinst,
                 CommandType type,
                 void* data,
                 run_command_proxy_sig proxy) {
  if (envinst == nullptr)
    return UV_ESRCH;
  return EnvInst::RunCommand(envinst, proxy, data, type);
}


int custom_command_(SharedEnvInst envinst,
                    std::string req_id,
                    std::string command,
                    std::string args,
                    void* data,
                    custom_command_proxy_sig proxy) {
  if (envinst == nullptr)
    return UV_ESRCH;
  return envinst->CustomCommand(req_id, command, args, proxy, data);
}


int at_exit_hook_(void* data,
                  at_exit_hook_proxy_sig proxy,
                  deleter_sig deleter) {
  EnvList::Inst()->AtExitHook(proxy, data, deleter);
  return 0;
}

}  // namespace internal
}  // namespace nsolid
}  // namespace node
