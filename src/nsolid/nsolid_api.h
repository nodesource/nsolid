#ifndef SRC_NSOLID_NSOLID_API_H_
#define SRC_NSOLID_NSOLID_API_H_

#include <atomic>
#include <functional>
#include <list>
#include <map>
#include <memory>
#include <string>
#include <tuple>
#include <vector>

#include "node.h"
#include "node_snapshotable.h"
#include "nsolid.h"
#include "../../deps/nsuv/include/nsuv-inl.h"
#include "nsolid_util.h"
#include "nsolid_trace.h"
#include "spinlock.h"
#include "thread_safe.h"
#include "v8.h"
// TODO(santigimeno) move json into its own deps folder.
// We can export it via ADDONS_PREREQS in the Makefile and link against it with
// our native module builds that depend on it
#include "nlohmann/json.hpp"

namespace node {
namespace nsolid {

#define NSOLID_JS_METRICS_COUNTERS(V)                                          \
  V(kHttpClientCount)                                                          \
  V(kHttpServerCount)                                                          \
  V(kHttpClientAbortCount)                                                     \
  V(kHttpServerAbortCount)                                                     \
  V(kDnsCount)                                                                 \
  V(kAsyncPipeServerCreatedCount)                                              \
  V(kAsyncPipeServerDestroyedCount)                                            \
  V(kAsyncPipeSocketCreatedCount)                                              \
  V(kAsyncPipeSocketDestroyedCount)                                            \
  V(kAsyncTcpServerCreatedCount)                                               \
  V(kAsyncTcpServerDestroyedCount)                                             \
  V(kAsyncTcpSocketCreatedCount)                                               \
  V(kAsyncTcpSocketDestroyedCount)                                             \
  V(kAsyncUdpSocketCreatedCount)                                               \
  V(kAsyncUdpSocketDestroyedCount)                                             \
  V(kAsyncPromiseCreatedCount)                                                 \
  V(kAsyncPromiseResolvedCount)

class EnvInst;
class EnvList;


template <typename DataType>
class DispatchQueue {
 public:
  using dispatch_queue_cb = void(*)(std::queue<DataType>&&);

  struct DQStor {
    DispatchQueue* dq;
    nsuv::ns_mutex destroy_lock;
  };

  DispatchQueue();
  ~DispatchQueue();

  int Init(void(*cb)(int er, DispatchQueue* dq));
  int Start(uint64_t timeout, size_t max, dispatch_queue_cb dispatch_cb);
  int Stop();
  int Enqueue(const DataType& data);
  int Enqueue(DataType&& data);
  // Manually send the data to be processed immediately.
  // Can use this to clear the queue after running stop. To make sure there
  // isn't a memory leak.
  int Dispatch(/* cb to notify that data has been processed? */);
  size_t Size();

 private:
  nsuv::ns_timer* timer_;
  void (*usr_init_cb_)(int, DispatchQueue*) = nullptr;
  TSQueue<DataType> queue_data_;
  std::atomic<bool> processing_ = { false };
  static void run_queue_(void*);
  static void run_queue_timer_(nsuv::ns_timer*);
  std::atomic<uint64_t> timeout_ = { 0 };
  std::atomic<size_t> max_ = { 0 };
  dispatch_queue_cb dispatch_cb_ = nullptr;
  // Will only run from the EnvList thread.
  static void timer_init_cb_(void*);
  static void timer_start_cb_(void*);
  static void timer_stop_cb_(void*);
  static void close_cb_(void*);

  DQStor* stor_;
};


/**
 * Class contains info and other calls necessary for accessing the associated
 * Environment.
 */
class EnvInst {
 public:
  NSOLID_DELETE_DEFAULT_CONSTRUCTORS(EnvInst)

  struct CmdQueueStor;

  using user_cb_sig = void(*)(SharedEnvInst, void*);
  using voided_cb_sig = void(*)(CmdQueueStor*);
  using optional_string = std::pair<bool, std::string>;
  using custom_command_cb_sig = void(*)(std::string,
                                        std::string,
                                        int status,
                                        optional_string,
                                        optional_string,
                                        void*);

  enum JSMetricsFields {
#define V(Name)                                                                \
    Name,
    NSOLID_JS_METRICS_COUNTERS(V)
#undef V
    kFieldCount
  };

  enum GCFields {
    kGcCount,
    kGcMajor,
    kGcFull,
    kGcForced,
    // TODO(trevnorris): Are we really going to track this?
    // kGcDurUsMedian,
    // kGcDurUs99Ptile,
    kGCFieldsCount
  };

  struct CmdQueueStor {
    SharedEnvInst envinst_sp;
    user_cb_sig cb;
    void* data;
  };

  struct CustomCommandStor {
    std::string command;
    std::string args;
    custom_command_cb_sig cb;
    void* data;
  };

  struct CustomCommandGlobalReq {
    std::string req_id;
    v8::Global<v8::Object> request;
  };

  using custom_command_stor_map = std::map<std::string, CustomCommandStor>;

  class Scope {
   public:
    explicit Scope(EnvInst* envinst) : envinst_(envinst) {
      envinst_->scope_lock_.lock();
    }
    explicit Scope(SharedEnvInst envinst_sp) : envinst_(envinst_sp.get()) {
      envinst_->scope_lock_.lock();
    }
    ~Scope() {
      envinst_->scope_lock_.unlock();
    }

    Scope(const Scope&) = delete;
    Scope& operator=(const Scope&) = delete;

    bool Success() const {
      return envinst_->env() != nullptr;
    }

   private:
    EnvInst* const envinst_;
  };

  // These calls must be static because there's a chance that GetInst() returns
  // an empty shared_ptr. So to perform the entire operation in a single fn
  // call, have the user pass in the thread_id.
  static int RunCommand(SharedEnvInst envinst_sp,
                        user_cb_sig cb,
                        void* data,
                        CommandType type);

  /*
   * It sends a custom command to the runtime
   * @param req_id - unique identifier of the command
   * @param command
   * @param args - command arguments in JSON stringified format.
   */
  int CustomCommand(std::string req_id,
                    std::string command,
                    std::string args,
                    custom_command_cb_sig cb,
                    void* data);

  int CustomCommandResponse(const std::string& req_id,
                            const char* value,
                            bool is_return);

  void PushClientBucket(double value);
  void PushServerBucket(double value);
  void PushDnsBucket(double value);

  std::string GetModuleInfo();
  std::string GetStartupTimes();

  void GetThreadMetrics(ThreadMetrics::MetricsStor* stor);

  void SetModuleInfo(const char* path, const char* module);
  void SetStartupTime(const char* name, uint64_t ts = uv_hrtime());
  void SetNodeStartupTime(const char* name, uint64_t ts = uv_hrtime());

  // This is for backwards compatibility with the on blocked event loop API
  // from v3.x.
  std::string GetOnBlockedBody();

  std::string GetThreadName() const;
  void SetThreadName(const std::string& name);

  void inc_fs_handles_closed() { fs_handles_closed_++; }
  void inc_fs_handles_opened() { fs_handles_opened_++; }

  /*
   * Return a shared_ptr<EnvInst> instead of a normal pointer because the
   * lifetime of the EnvInst instance depends on the state of several things
   * that exist in different threads. So holding onto the shared_ptr guarantees
   * the instance won't be cleaned up early.
   */
  static SharedEnvInst GetInst(uint64_t thread_id);
  static SharedEnvInst GetCurrent(v8::Isolate* isolate);
  static SharedEnvInst GetCurrent(v8::Local<v8::Context> context);
  // This should only be run within the thread and during the lifetime of the
  // associated node::Environment. The pointer should not be retained past the
  // scope of the function.
  static EnvInst* GetEnvLocalInst(v8::Isolate* isolate);

  static SharedEnvInst Create(Environment* env);

  static void CustomCommandReqWeakCallback(
    const v8::WeakCallbackInfo<EnvInst::CustomCommandGlobalReq>&);

  inline Environment* env() const;
  constexpr v8::Isolate* isolate() const;
  constexpr uint64_t thread_id() const;
  constexpr uv_loop_t* event_loop() const;
  constexpr uv_thread_t creation_thread() const;
  constexpr bool is_main_thread() const;
  inline uv_metrics_t* metrics_info();
  inline void inc_makecallback_count();
  // <last entry, last exit>
  inline std::pair<uint64_t, uint64_t> provider_times();
  bool can_call_into_js() const;
  uint32_t* get_trace_flags() { return &trace_flags_; }

  std::atomic<bool> metrics_paused = { false };

  // Track the values of JSMetricsFields.
  double count_fields[kFieldCount];
  // Array to track garbage collection information.
  uint64_t gc_fields[kGCFieldsCount];

  // TODO(trevnorris): Most of these metrics are counters, but metrics like
  // cpuPercent are calculated based on the last call to GetEnvMetrics(). So
  // there should be something like a metrics instance that is created by
  // the user. If we include the additional raw metrics used to calculate
  // CPU time then the object would be self encapsulated and can be
  // recalculated in JS.
  ThreadMetrics tmetrics;
  ProcessMetrics pmetrics;

 private:
  friend class Metrics;
  friend class EnvList;
  friend class ThreadMetrics;
  friend class std::shared_ptr<EnvInst>;

  explicit EnvInst(Environment* env);
  ~EnvInst() = default;

  static void run_event_loop_cmds_(nsuv::ns_async*, EnvInst*);
  static void run_interrupt_msg_(nsuv::ns_async*, EnvInst*);
  static void run_interrupt_(void* arg);
  static void run_interrupt_only_(v8::Isolate* isolate, void* arg);
  static void handle_cleanup_cb_(Environment* env,
                                 uv_handle_t* handle,
                                 void*);

  static void uv_metrics_cb_(nsuv::ns_prepare* handle, EnvInst* envinst);
  static void v8_gc_prologue_cb_(v8::Isolate* isolate,
                                 v8::GCType type,
                                 v8::GCCallbackFlags flags,
                                 void* data);
  static void v8_gc_epilogue_cb_(v8::Isolate* isolate,
                                 v8::GCType type,
                                 v8::GCCallbackFlags flags,
                                 void* data);
  static void close_nsolid_loader_(void* ptr);
  static void run_nsolid_loader_(nsuv::ns_timer* handle, Environment* env);

  static void custom_command_(SharedEnvInst envinst_sp, void* data);

  void add_metric_datapoint_(MetricsStream::Type, double);
  void send_datapoint(MetricsStream::Type, double);

  static void get_event_loop_stats_(EnvInst* envinst,
                                    ThreadMetrics::MetricsStor* stor);
  static void get_heap_stats_(EnvInst* envinst,
                              ThreadMetrics::MetricsStor* stor);
  static void get_gc_stats_(EnvInst* envinst,
                            ThreadMetrics::MetricsStor* stor);
  static void get_http_dns_stats_(EnvInst* envinst,
                                  ThreadMetrics::MetricsStor* stor);

  std::atomic<Environment*> env_;
  v8::Isolate* isolate_;
  uv_loop_t* event_loop_;
  uint64_t thread_id_ = UINT64_MAX;
  uv_thread_t creation_thread_;
  bool is_main_thread_;
  // This is what's used to queue commands that run on the Worker's event loop.
  nsuv::ns_async eloop_cmds_msg_;
  TSQueue<CmdQueueStor> eloop_cmds_q_;
  TSQueue<CmdQueueStor> interrupt_cb_q_;
  TSQueue<CmdQueueStor> interrupt_only_cb_q_;
  // Store the stringified info object sent to the Console.
  std::map<std::string, std::string> module_info_;
  std::string module_info_stringified_;
  // Using the same lock for info_ and module_info_.
  nsuv::ns_mutex info_lock_;

  // For backwards compatible stack traces of blocked event loop calls.
  std::atomic<uint64_t> makecallback_cntr_ = { 0 };
  // Collect event loop metrics from libuv.
  uv_metrics_t metrics_info_;
  nsuv::ns_prepare metrics_handle_;
  // Metrics necessary to calculate if the event loop has been blocked, and if
  // so then for how long.
  uint64_t blocked_busy_diff_ = 0;
  uint64_t blocked_idle_diff_ = 0;
  // Values required for metrics calculations.
  uint64_t loop_with_events_ = 0;
  uint64_t provider_delay_ = 0;
  uint64_t processing_delay_ = 0;
  uint64_t prev_metrics_cb_time_ = 0;
  uint64_t prev_loop_proc_time_ = 0;
  uint64_t prev_loop_idle_time_ = 0;
  uint64_t prev_events_processed_ = 0;
  uint64_t prev_events_waiting_ = 0;
  uint64_t fs_handles_closed_ = 0;
  uint64_t fs_handles_opened_ = 0;
  double rolling_est_lag_ = 0;
  double rolling_events_waiting_ = 0;
  // Store responsiveness metric info.
  double res_arr_[4];
  uint64_t gc_start_;
  utils::ring_buffer gc_ring_;
  // Track user specified startup times.
  std::map<std::string, uint64_t> startup_times_;
  nsuv::ns_mutex startup_times_lock_;
  // Track whether the event loop has been blocked. If it has then don't report
  // it again in blocked_loop_timer_cb_(), and report when it's unblocked when
  // the loop's metrics callback is called.
  std::atomic<bool> reported_blocked_ = { false };
  std::atomic<bool> blocked_body_created_ = { false };

  // TODO(trevnorris): This is temporary until the change can be made to the
  // Console to accept streaming raw metrics. This will only work for a single
  // external service making the metrics calls.
  std::vector<double> dns_bucket_;
  std::vector<double> client_bucket_;
  std::vector<double> server_bucket_;
  std::atomic<double> dns_median_ = { 0 };
  std::atomic<double> dns99_ptile_ = { 0 };
  std::atomic<double> http_client_median_ = { 0 };
  std::atomic<double> http_client99_ptile_ = { 0 };
  std::atomic<double> http_server_median_ = { 0 };
  std::atomic<double> http_server99_ptile_ = { 0 };

  nsuv::ns_mutex scope_lock_;

  custom_command_stor_map custom_command_stor_map_;
  nsuv::ns_mutex custom_command_stor_map_lock_;

  std::string thread_name_;
  uint32_t trace_flags_;
  bool has_metrics_stream_hooks_;
};

/**
 * Only one instance will be instantiated, at startup. From here each thread
 * that creates a new Environment will register itself.
 */
class EnvList {
 public:
  NSOLID_DELETE_UNUSED_CONSTRUCTORS(EnvList)

  // Used for EnvList::QueueCallback.
  using q_cb_sig = void(*)(void*);
  using q_data_v = std::vector<void*>;
  using q_proxy_sig = void(*)(void(*)(), const q_data_v&);
  using env_creation_sig = void(*)(SharedEnvInst, void*);
  using env_deletion_sig = env_creation_sig;
  using on_config_sig = void(*)(std::string, void*);
  using on_config_void_cb_sig = void(*)(void(*)(), std::string, void*);
  using on_blocked_loop_sig = void(*)(SharedEnvInst,
                                      std::string,
                                      void*);
  using on_unblocked_loop_sig = on_blocked_loop_sig;
  using config_hook_tp = std::tuple<std::string, void(*)(), void*>;
  using at_exit_sig = void(*)(bool, bool, void*);
  using at_exit_void_cb_sig = void(*)(bool, bool, void*);
  using void_cb_sig = void(*)(void*);

  struct EnvHookStor {
    env_creation_sig cb;
    nsolid::internal::user_data data;
  };

  struct QCbStor {
    q_cb_sig cb;
    void* data;
  };

  struct QCbTimeoutStor {
    q_cb_sig cb;
    void* data;
    void(*timer_cb)(nsuv::ns_timer*, QCbTimeoutStor*);
    uint64_t timeout;
    uint64_t hrtime;
  };

  // The std::string passed to on_config_void_cb_sig is provided with the call
  // to UpdateConfig().
  struct OnConfigHookStor {
    on_config_sig cb;
    nsolid::internal::user_data data;
  };

  struct BlockedLoopStor {
    uint64_t threshold;
    on_blocked_loop_sig cb;
    nsolid::internal::user_data data;
  };

  struct AtExitStor {
    at_exit_void_cb_sig cb;
    nsolid::internal::user_data data;
  };

  struct MetricsStreamHookStor {
    uint32_t flags;
    MetricsStream* stream;
    MetricsStream::metrics_stream_proxy_sig cb;
    nsolid::internal::user_data data;
  };

  // Return the one true instance.
  static EnvList* Inst();

  // This call is thread-safe.
  std::string AgentId();

  void OnConfigurationHook(
      void* data,
      internal::on_configuration_hook_proxy_sig proxy,
      internal::deleter_sig deleter);

  void EnvironmentCreationHook(
      void* data,
      internal::thread_added_hook_proxy_sig proxy,
      internal::deleter_sig deleter);
  void EnvironmentDeletionHook(
      void* data,
      internal::thread_removed_hook_proxy_sig proxy,
      internal::deleter_sig deleter);

  // A hook to report EnvInst instances that have been blocked.
  void OnBlockedLoopHook(uint64_t threshold,
                         void* data,
                         internal::on_block_loop_hook_proxy_sig proxy,
                         internal::deleter_sig deleter);
  void OnUnblockedLoopHook(
      void* data,
      internal::on_unblock_loop_hook_proxy_sig proxy,
      internal::deleter_sig deleter);

  // Queue callbacks to run on the EnvList thread without reference to a
  // specific EnvInst instance.
  int QueueCallback(q_cb_sig cb, void* data);
  int QueueCallback(q_cb_sig cb, uint64_t timeout, void* data);

  // These should only be called from node threads.
  void AddEnv(Environment* env);
  void RemoveEnv(Environment* env);

  std::string GetInfo();
  void StoreInfo(const std::string& info);

  std::string CurrentConfig();
  nlohmann::json CurrentConfigJSON();
  // It merges the current config with the new properties in the 'config'
  // argument
  void UpdateConfig(const nlohmann::json& config);
  void UpdateConfig(const std::string& config);

  void DoExit(bool on_signal);
  void SetupExitHandlers();

  void AtExitHook(at_exit_sig hook, void* data, internal::deleter_sig deleter);

  void SetExitCode(int code);
  void SetExitError(v8::Isolate* isolate,
                    const v8::Local<v8::Value>& error,
                    const v8::Local<v8::Message>& message);
  void SetSavedExitError(v8::Isolate* isolate,
                         const v8::Local<v8::Value>& error);
  void ClearSavedExitError();

  int GetExitCode() const;
  std::tuple<std::string, std::string>* GetExitError();

  void PromiseTracking(bool promiseTracking);

  void popSpanId(std::string&);

  void popTraceId(std::string&);

  void UpdateHasMetricsStreamHooks(bool has_metrics);

  void UpdateTracingFlags(uint32_t flags);

  void SetTimeOrigin(double t) { time_origin_ = t; }

  double GetTimeOrigin() const { return time_origin_; }

  inline uv_thread_t thread();
  inline size_t env_map_size();
  inline nsuv::ns_mutex* command_lock();
  inline nlohmann::json current_config();
  inline uint32_t current_config_version();
  inline uv_loop_t* thread_loop();
  inline bool IsAlive() {
    return is_alive_.load(std::memory_order_relaxed);
  }
  inline uint64_t main_thread_id() { return main_thread_id_; }

  tracing::TracerImpl* GetTracer() { return &tracer_; }
  void send_trace_data(tracing::SpanItem&& item);

  TSList<MetricsStreamHookStor>::iterator
  AddMetricsStreamHook(uint32_t flags,
                       MetricsStream* stream,
                       MetricsStream::metrics_stream_proxy_sig cb,
                       internal::deleter_sig deleter,
                       void* data);
  void RemoveMetricsStreamHook(TSList<MetricsStreamHookStor>::iterator it);

 private:
  friend class EnvInst;
  friend class Metrics;
  friend class tracing::TracerImpl;

  EnvList();
  // This runs as the stack unwinds after main() returns. This way we know the
  // process is shutting down.
  ~EnvList();
  void operator delete(void*) = delete;

  static void exit_handler_();

  void DoSetExitError(v8::Isolate* isolate,
                      const v8::Local<v8::Value>& error,
                      const v8::Local<v8::Message>& message,
                      std::string* msg,
                      std::string* stack);

  void fill_span_id_q();

  void fill_trace_id_q();

#ifdef __POSIX__
  static void signal_handler_(int signum, siginfo_t* info, void* ucontext);
  void setup_signal_handler(int signum);
#endif

  static void get_blocked_loop_body_(SharedEnvInst envinst_sp, void*);
  static void process_callbacks_(nsuv::ns_async*, EnvList* envlist);
  static void removed_env_cb_(nsuv::ns_async*, EnvList* envlist);
  static void env_list_routine_(nsuv::ns_thread*, EnvList* envlist);
  static void blocked_loop_timer_cb_(nsuv::ns_timer*);
  static void gen_ptiles_cb_(nsuv::ns_timer*);
  static void raw_metrics_timer_cb_(nsuv::ns_timer*);
  static void promise_tracking_(const EnvInst& envinst, bool track);
  static void enable_promise_tracking_(SharedEnvInst envinst_sp, void*);
  static void disable_promise_tracking_(SharedEnvInst envinst_sp, void*);
  static void update_has_metrics_stream_hooks(SharedEnvInst, bool has_metrics);
  static void update_tracing_flags(SharedEnvInst envinst_sp, uint32_t flags);
  static void fill_tracing_ids_cb_(nsuv::ns_async*, EnvList* envlist);
  static void q_cb_timeout_cb_(nsuv::ns_timer*, QCbTimeoutStor*);
  static void datapoint_cb_(std::queue<MetricsStream::Datapoint>&&);

  std::atomic<bool> is_alive_ = { true };
  // unique agent id
  const std::string agent_id_ = utils::generate_unique_id();
  // The thread that EnvList is running on.
  uv_loop_t thread_loop_;
  nsuv::ns_async process_callbacks_msg_;
  nsuv::ns_async removed_env_msg_;
  nsuv::ns_thread thread_;
  // Used to access env_map.
  nsuv::ns_mutex map_lock_;
  // A map of all Environments in the process.
  std::map<uint64_t, SharedEnvInst> env_map_;
  std::atomic<uint64_t> main_thread_id_ = {0xFFFFFFFFFFFFFFFF};
  // Lock EnvList while all command queues are being processed. This is to
  // prevent ~EnvList from running while processing all commands.
  nsuv::ns_mutex command_lock_;
  TSList<EnvHookStor> env_creation_list_;
  TSList<EnvHookStor> env_deletion_list_;
  // Queue of callbacks on EnvList thread with no associated EnvInst.
  TSQueue<QCbStor> queued_cb_q_;
  // List for OnConfigurationHook callbacks, and queue of configuration
  // strings that will be passed to the user's hooks.
  TSList<OnConfigHookStor> on_config_hook_list_;
  TSQueue<std::string> on_config_string_q_;
  // Queue for QueueCallback with timer to create the timer from the EnvList
  // thread.
  TSQueue<QCbTimeoutStor*> q_cb_create_timeout_;
  // Store the last configuration to be passed in. Make accessing that string
  // thread safe.
  nlohmann::json info_;
  nsuv::ns_mutex info_lock_;
  nlohmann::json current_config_;
  nsuv::ns_mutex configuration_lock_;
  // Versioning info for JS to quickly check if it needs to synchronize with
  // its local version.
  std::atomic<uint32_t> current_config_version_ = { 0 };
  // List of callbacks for on blocked loop hook.
  TSList<BlockedLoopStor> blocked_hooks_list_;
  TSQueue<std::tuple<SharedEnvInst, std::string>> blocked_loop_q_;
  // List of callbacks for on blocked loop hook.
  TSList<BlockedLoopStor> unblocked_hooks_list_;
  TSQueue<std::tuple<SharedEnvInst, std::string>> unblocked_loop_q_;
  // Be called every N seconds to check if any EnvInst instance loops have been
  // blocked.
  nsuv::ns_timer blocked_loop_timer_;
  std::atomic<uint64_t> min_blocked_threshold_ = { UINT64_MAX };
  // TODO(trevnorris): Temporary until Console supports streaming metrics
  nsuv::ns_timer gen_ptiles_timer_;
  // exit data
  std::atomic<bool> exiting_ = { false };
  std::atomic<int> exit_code_;
  // exit_error_ stores the error message and the error stack
  std::unique_ptr<std::tuple<std::string, std::string>> exit_error_;
  std::unique_ptr<std::tuple<std::string, std::string>> saved_exit_error_;
  nsuv::ns_mutex exit_lock_;

  TSList<AtExitStor> at_exit_hook_list_;
  // For metric datapoints collection
  DispatchQueue<MetricsStream::Datapoint> datapoints_q_;
  TSList<MetricsStreamHookStor> metrics_stream_hook_list_;

  nsuv::ns_async fill_tracing_ids_msg_;
  TSQueue<std::string> span_id_q_;
  TSQueue<std::string> trace_id_q_;
  tracing::TracerImpl tracer_;
  DispatchQueue<tracing::SpanItem> span_item_q_;

  double time_origin_;
};


// TEMPLATE FUNCTION IMPLEMENTATIONS //


template <typename DataType>
DispatchQueue<DataType>::DispatchQueue()
    : timer_(new nsuv::ns_timer()) {
  stor_ = new DQStor();
  stor_->dq = this;
  int r = stor_->destroy_lock.init(true);
  if (r != 0)
    abort();
  timer_->set_data(stor_);
}

template <typename DataType>
DispatchQueue<DataType>::~DispatchQueue() {
  EnvList* envlist = EnvList::Inst();
  uv_thread_t t1 = envlist->thread();
  uv_thread_t t2 = uv_thread_self();
  if (uv_thread_equal(&t1, &t2) || !envlist->IsAlive()) {
    assert(stor_ == timer_->get_data<DQStor>());
    delete(stor_);
    timer_->close_and_delete();
  } else {
    {
      nsuv::ns_mutex::scoped_lock lock(stor_->destroy_lock);
      stor_->dq = nullptr;
    }

    envlist->QueueCallback(DispatchQueue<DataType>::close_cb_, timer_);
  }
}

template <typename DataType>
int DispatchQueue<DataType>::Init(void(*cb)(int, DispatchQueue*)) {
  usr_init_cb_ = cb;
  return EnvList::Inst()->QueueCallback(timer_init_cb_, timer_);
}

template <typename DataType>
int DispatchQueue<DataType>::Start(uint64_t timeout,
                                   size_t max,
                                   dispatch_queue_cb dispatch_cb) {
  timeout_ = timeout;
  max_ = max;
  dispatch_cb_ = dispatch_cb;
  return EnvList::Inst()->QueueCallback(timer_start_cb_, timer_);
}

template <typename DataType>
int DispatchQueue<DataType>::Stop() {
  if (timeout_ == 0 && max_ == 0) {
    return 0;
  }

  timeout_ = 0;
  max_ = 0;
  return EnvList::Inst()->QueueCallback(timer_stop_cb_, timer_);
}

template <typename DataType>
int DispatchQueue<DataType>::Enqueue(const DataType& data) {
  size_t size = queue_data_.enqueue(data);
  int er = 0;
  // No reason to call QueueCallback() if the data is currently being
  // processed. This isn't 100% thread safe. There is a slight chance that it
  // can be enqueued multiple times, but that won't cause any issues.
  if (!processing_ && max_ > 0 && size > max_) {
    er = EnvList::Inst()->QueueCallback(run_queue_, this);
  }
  return er;
}

template <typename DataType>
int DispatchQueue<DataType>::Enqueue(DataType&& data) {
  size_t size = queue_data_.enqueue(std::move(data));
  int er = 0;
  // No reason to call QueueCallback() if the data is currently being
  // processed. This isn't 100% thread safe. There is a slight chance that it
  // can be enqueued multiple times, but that won't cause any issues.
  if (!processing_ && max_ > 0 && size > max_) {
    er = EnvList::Inst()->QueueCallback(run_queue_, this);
  }
  return er;
}

template <typename DataType>
int DispatchQueue<DataType>::Dispatch() {
  if (processing_) {
    return 0;
  }
  return EnvList::Inst()->QueueCallback(run_queue_, this);
}

template <typename DataType>
size_t DispatchQueue<DataType>::Size() {
  return queue_data_.size();
}

template <typename DataType>
void DispatchQueue<DataType>::run_queue_(void* data) {
  DispatchQueue* dq = static_cast<DispatchQueue*>(data);
  if (dq) {
    dq->processing_ = true;
    std::queue<DataType> q;
    dq->queue_data_.swap(q);
    dq->dispatch_cb_(std::move(q));
    dq->processing_ = false;
  }
}

template <typename DataType>
void DispatchQueue<DataType>::run_queue_timer_(nsuv::ns_timer* timer) {
  DQStor* stor = timer->get_data<DQStor>();
  nsuv::ns_mutex::scoped_lock lock(stor->destroy_lock);
  run_queue_(stor->dq);
}

template <typename DataType>
void DispatchQueue<DataType>::timer_init_cb_(void* data) {
  nsuv::ns_timer* timer = static_cast<nsuv::ns_timer*>(data);
  DQStor* stor = timer->get_data<DQStor>();
  nsuv::ns_mutex::scoped_lock lock(stor->destroy_lock);
  DispatchQueue* dq = stor->dq;
  if (!dq) {
    return;
  }

  int er = timer->init(EnvList::Inst()->thread_loop());
  if (!er) {
    timer->unref();
  }
  dq->usr_init_cb_(er, dq);
}

template <typename DataType>
void DispatchQueue<DataType>::timer_start_cb_(void* data) {
  nsuv::ns_timer* timer = static_cast<nsuv::ns_timer*>(data);
  DQStor* stor = timer->get_data<DQStor>();
  nsuv::ns_mutex::scoped_lock lock(stor->destroy_lock);
  DispatchQueue* dq = stor->dq;
  if (!dq) {
    return;
  }

  int er = timer->start(run_queue_timer_, dq->timeout_, dq->timeout_);
  if (er) { /* TODO */ }
}

template <typename DataType>
void DispatchQueue<DataType>::timer_stop_cb_(void* data) {
  nsuv::ns_timer* timer = static_cast<nsuv::ns_timer*>(data);
  int er = timer->stop();
  if (er) { /* TODO */ }
}

template <typename DataType>
void DispatchQueue<DataType>::close_cb_(void* data) {
  nsuv::ns_timer* timer = static_cast<nsuv::ns_timer*>(data);
  delete(timer->get_data<DQStor>());
  timer->close_and_delete();
}

inline Environment* EnvInst::env() const {
  return env_.load(std::memory_order_relaxed);
}


constexpr v8::Isolate* EnvInst::isolate() const {
  return isolate_;
}


constexpr uint64_t EnvInst::thread_id() const {
  return thread_id_;
}

constexpr uv_loop_t* EnvInst::event_loop() const {
  return event_loop_;
}

constexpr uv_thread_t EnvInst::creation_thread() const {
  return creation_thread_;
}

constexpr bool EnvInst::is_main_thread() const {
  return is_main_thread_;
}

inline uv_metrics_t* EnvInst::metrics_info() {
  return &metrics_info_;
}

inline void EnvInst::inc_makecallback_count() {
  makecallback_cntr_++;
}

inline std::pair<uint64_t, uint64_t> EnvInst::provider_times() {
  uint64_t entry;
  uint64_t exit;

  // Need to lock this so the event loop isn't erased while attempting to read
  // the provider time.
  EnvInst::Scope scp(this);
  if (event_loop_ == nullptr)
    return { 0, 0 };
  uv_metrics_provider_times(event_loop_, &entry, &exit);
  return { entry, exit };
}

inline uv_thread_t EnvList::thread() {
  return thread_.base();
}

inline size_t EnvList::env_map_size() {
  return env_map_.size();
}

inline nsuv::ns_mutex* EnvList::command_lock() {
  return &command_lock_;
}

inline nlohmann::json EnvList::current_config() {
  nsuv::ns_mutex::scoped_lock lock(configuration_lock_);
  return current_config_;
}

inline uint32_t EnvList::current_config_version() {
  return current_config_version_;
}

inline uv_loop_t* EnvList::thread_loop() {
  return &thread_loop_;
}

}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_NSOLID_API_H_
