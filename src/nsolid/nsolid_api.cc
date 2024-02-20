#include "nsolid_api.h"
#include "nsolid/nsolid_heap_snapshot.h"
#include "nsolid_bindings.h"
#include "node_buffer.h"
#include "nsolid_cpu_profiler.h"
#include "otlp/src/otlp_agent.h"
#include "statsd/src/statsd_agent.h"
#include "nsuv-inl.h"
#include "util.h"
#include "env-inl.h"
#include "uv.h"
#include "node_internals.h"
#include "node_external_reference.h"
#include "memory_tracker-inl.h"
#include "node_perf.h"
#include "v8-fast-api-calls.h"

#include <cmath>

#define MICROS_PER_SEC 1000000
#define NANOS_PER_SEC 1000000000

#define SPAN_ID_Q_MIN_THRESHOLD   10
#define SPAN_ID_Q_REFILL_ITEMS    20
#define TRACE_ID_Q_MIN_THRESHOLD  10
#define TRACE_ID_Q_REFILL_ITEMS   20

namespace node {
namespace nsolid {

using nsuv::ns_async;
using nsuv::ns_mutex;
using nsuv::ns_thread;
using nsuv::ns_timer;

using tracing::Span;
using tracing::SpanItem;
using tracing::SpanPropBase;

using v8::ArrayBuffer;
using v8::BackingStore;
using v8::Context;
using v8::Float64Array;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::GCCallbackFlags;
using v8::GCType;
using v8::HandleScope;
using v8::HeapCodeStatistics;
using v8::HeapStatistics;
using v8::Integer;
using v8::Isolate;
using v8::JSON;
using v8::Local;
using v8::Message;
using v8::Name;
using v8::Number;
using v8::Object;
using v8::StackFrame;
using v8::StackTrace;
using v8::String;
using v8::Symbol;
using v8::Uint32;
using v8::Uint32Array;
using v8::Value;
using v8::WeakCallbackInfo;
using v8::WeakCallbackType;


static void calculateHttpDnsPtiles(
    std::vector<double>& bucket,  // NOLINT(runtime/references)
    std::atomic<double>& median,  // NOLINT(runtime/references)
    std::atomic<double>& ptile);  // NOLINT(runtime/references)
static void calculatePtiles(std::vector<double>* vals, double* med, double* nn);

// EnvList runs a timer every blocked_loop_interval milliseconds to check if
// any thread have been blocked longer than the threadshold passed to
// OnBlockedLoopHook().
constexpr uint64_t blocked_loop_interval = 100;
uint64_t gen_ptiles_interval = 3000;
constexpr uint64_t datapoints_q_interval = 100;
constexpr size_t datapoints_q_max_size = 100;

static const char* get_startuptime_name(const char* name);


EnvInst::EnvInst(Environment* env)
    : count_fields(),
      gc_fields(),
      tmetrics(env->thread_id()),
      env_(env),
      isolate_(env->isolate()),
      event_loop_(env->event_loop()),
      thread_id_(env->thread_id()),
      creation_thread_(uv_thread_self()),
      is_main_thread_(env->is_main_thread()),
      module_info_(),
      module_info_stringified_(),
      metrics_info_(),
      prev_metrics_cb_time_(uv_hrtime()),
      res_arr_(),
      gc_ring_(1000),
      trace_flags_(EnvList::Inst()->GetTracer()->traceFlags()),
      has_metrics_stream_hooks_(
        EnvList::Inst()->metrics_stream_hook_list_.size() > 0) {
  int er;

  er = eloop_cmds_msg_.init(event_loop_, run_event_loop_cmds_, this);
  CHECK_EQ(er, 0);
  er = interrupt_msg_.init(event_loop_, run_interrupt_msg_, this);
  CHECK_EQ(er, 0);
  er = metrics_handle_.init(event_loop_);
  CHECK_EQ(er, 0);
  er = info_lock_.init(true);
  CHECK_EQ(er, 0);
  er = startup_times_lock_.init(true);
  CHECK_EQ(er, 0);
  er = scope_lock_.init_recursive(true);
  CHECK_EQ(er, 0);
  er = custom_command_stor_map_lock_.init(true);
  CHECK_EQ(er, 0);

  eloop_cmds_msg_.unref();
  interrupt_msg_.unref();
  metrics_handle_.unref();
  env->RegisterHandleCleanup(eloop_cmds_msg_.base_handle(),
                             handle_cleanup_cb_,
                             nullptr);
  env->RegisterHandleCleanup(interrupt_msg_.base_handle(),
                             handle_cleanup_cb_,
                             nullptr);
  env->RegisterHandleCleanup(metrics_handle_.base_handle(),
                             handle_cleanup_cb_,
                             nullptr);
  er = metrics_handle_.start(uv_metrics_cb_, this);
  CHECK_EQ(er, 0);
}


int EnvInst::RunCommand(SharedEnvInst envinst_sp,
                        user_cb_sig cb,
                        void* data,
                        CommandType type) {
  // If the return value is empty then the thread no longer exists.
  if (!envinst_sp) {
    return UV_ESRCH;
  }

  // About to run a command, so lock access to the EnvInst to prevent other
  // Commands from running or the Worker from shutting down.
  EnvInst::Scope scp(envinst_sp);

  // Check if the Environment has already been destroyed even though the
  // EnvInst instance still existed in the map.
  if (!scp.Success()) {
    return UV_EBADF;
  }

  if (type == CommandType::Interrupt) {
    EnvInst::CmdQueueStor cmd_stor = { envinst_sp, cb, data };
    // Send it off to both locations. The first to run will retrieve the data
    // from the queue.
    envinst_sp->interrupt_cb_q_.enqueue(std::move(cmd_stor));
    envinst_sp->isolate()->RequestInterrupt(run_interrupt_, nullptr);
    return envinst_sp->interrupt_msg_.send();
  }

  if (type == CommandType::InterruptOnly) {
    EnvInst::CmdQueueStor cmd_stor = { envinst_sp, cb, data };
    envinst_sp->interrupt_only_cb_q_.enqueue(std::move(cmd_stor));
    envinst_sp->isolate()->RequestInterrupt(run_interrupt_only_, nullptr);
    return 0;
  }

  // Add the command to be executed by the target thread_id. If the thread is
  // already shutting down then the command will not run. But the user will be
  // notified of this by EnvironmentDeletionHook().
  if (type == CommandType::EventLoop) {
    EnvInst::CmdQueueStor cmd_stor = { envinst_sp, cb, data };
    envinst_sp->eloop_cmds_q_.enqueue(std::move(cmd_stor));
    return envinst_sp->eloop_cmds_msg_.send();
  }

  return UV_EINVAL;
}



void EnvInst::PushClientBucket(double value) {
  send_datapoint(MetricsStream::Type::kHttpClient, value);
}


void EnvInst::PushServerBucket(double value) {
  send_datapoint(MetricsStream::Type::kHttpServer, value);
}


void EnvInst::PushDnsBucket(double value) {
  send_datapoint(MetricsStream::Type::kDns, value);
}


std::string EnvInst::GetModuleInfo() {
  ns_mutex::scoped_lock lock(info_lock_);
  if (!module_info_stringified_.empty())
    return module_info_stringified_;
  module_info_stringified_ = "[";
  for (auto item : module_info_) {
    module_info_stringified_ += item.second;
    module_info_stringified_ += ",";
  }
  if (module_info_stringified_.length() > 1)
    module_info_stringified_.pop_back();
  module_info_stringified_ += "]";
  return module_info_stringified_;
}


static void AppendStartupTimeString(const std::string& name,
                                    int64_t tm,
                                    std::string* mstr) {
  uint32_t sec;
  uint32_t ns;

  if (tm <= 0) {
    *mstr += "\"" + name + "\": [0,0],";
    return;
  }

  // In order to replicate the same data that is returned by the JS API
  // process.hrtime() we're using the same transformation as is used in
  // node_process_methods.cc.
  sec = ((tm / NANOS_PER_SEC) >> 32) * 0x100000000 +
        ((tm / NANOS_PER_SEC) & 0xffffffff);
  ns = tm % NANOS_PER_SEC;
  *mstr += "\"" + name + "\":[" + std::to_string(sec) + "," +
    std::to_string(ns) + "],";
}


std::string EnvInst::GetStartupTimes() {
  std::string mstr = "{";
  {
    ns_mutex::scoped_lock lock(startup_times_lock_);
    for (auto item : startup_times_) {
      AppendStartupTimeString(item.first,
                              item.second - performance::timeOrigin,
                              &mstr);
    }
  }
  mstr.pop_back();
  mstr += "}";
  return mstr;
}


void EnvInst::GetThreadMetrics(ThreadMetrics::MetricsStor* stor) {
  DCHECK(utils::are_threads_equal(uv_thread_self(), creation_thread()));
  CHECK_NE(env(), nullptr);

  stor->current_hrtime_ = uv_hrtime();
  // TODO(trevnorris): Does this work instead of calling ms_since_epoch?
  // stor->timestamp = (stor->current_hrtime_ - env()->time_origin()) / 1e6 +
  //     env()->time_origin_timestamp() / 1e3;
  stor->timestamp = utils::ms_since_epoch();
  stor->thread_id = thread_id();
  stor->thread_name = GetThreadName();
  stor->active_handles = event_loop()->active_handles;
  stor->active_requests = event_loop()->active_reqs.count;
  stor->fs_handles_closed = fs_handles_closed_;
  stor->fs_handles_opened = fs_handles_opened_;


  get_event_loop_stats_(this, stor);
  get_heap_stats_(this, stor);
  get_gc_stats_(this, stor);
  get_http_dns_stats_(this, stor);
}


void EnvInst::SetModuleInfo(const char* path, const char* module) {
  ns_mutex::scoped_lock lock(info_lock_);
  module_info_[path] = module;
  module_info_stringified_.clear();
}


void EnvInst::SetStartupTime(const char* name, uint64_t ts) {
  ns_mutex::scoped_lock lock(startup_times_lock_);
  // Don't want to overwrite another startup time, so use insert.
  startup_times_.insert({ name, ts });
}


void EnvInst::SetNodeStartupTime(const char* name, uint64_t ts) {
  ns_mutex::scoped_lock lock(startup_times_lock_);
  startup_times_.insert({ get_startuptime_name(name), ts });
}


std::string EnvInst::GetOnBlockedBody() {
  DCHECK(utils::are_threads_equal(creation_thread(), uv_thread_self()));
  uv_metrics_t metrics;
  SharedEnvInst envinst = GetCurrent(isolate_);
  if (envinst == nullptr) {
    return "";
  }

  HandleScope scope(isolate_);
  Local<StackTrace> stack =
      StackTrace::CurrentStackTrace(isolate_, 100, StackTrace::kDetailed);

  // In this case there was no stack because this was called when the thread
  // was idle (or in some other case where there's no stack available).
  if (stack->GetFrameCount() == 0) {
    return "";
  }

  std::string body_string = "{";
  // TODO(trevnorris): REMOVE provider_times so libuv don't need to use the
  // floating patch.
  uv_metrics_info(envinst->event_loop(), &metrics);
  uint64_t exit_time = metrics.loop_count == 0 ?
    performance::timeOrigin : provider_times().second;

  body_string += "\"threadId\":";
  body_string += std::to_string(thread_id_);
  body_string += ",\"blocked_for\":";
  body_string += std::to_string((uv_hrtime() - exit_time) / MICROS_PER_SEC);
  body_string += ",\"loop_id\":";
  body_string += std::to_string(metrics.loop_count);
  body_string += ",\"callback_cntr\":";
  body_string += std::to_string(makecallback_cntr_);

  // Add a space after the [ in case the stack frame count == 0. Then the
  // pop_back() won't make the JSON invalid.
  body_string += ",\"stack\":[ ";

  for (int i = 0; i < stack->GetFrameCount(); i++) {
    std::string frame = "{";
    Local<StackFrame> stack_frame = stack->GetFrame(isolate_, i);
    bool is_eval = stack_frame->IsEval();

    frame += "\"is_eval\":";
    frame += is_eval ? "true" : "false";
    frame += ",\"script_name\":";

    Local<String> script_name_v;
    if (!is_eval || stack_frame->GetScriptId() != Message::kNoScriptIdInfo) {
      script_name_v = stack_frame->GetScriptName();
      // GetScriptName() can return an empty handle so check for it
      if (script_name_v.IsEmpty()) {
        frame += "null";
      } else {
        String::Utf8Value s(isolate_, script_name_v);
        nlohmann::json script_n(*s);
        frame += script_n.dump();
      }
    } else {
      frame += "null";
    }

    Local<String> fn_name_s = stack_frame->GetFunctionName();
    frame += ",\"function_name\":";
    if (!fn_name_s.IsEmpty() && fn_name_s->Length() >= 0) {
      String::Utf8Value f(isolate_, fn_name_s);
      nlohmann::json function_n(*f);
      frame += function_n.dump();
    } else {
      frame += "null";
    }

    frame += ",\"line_number\":";
    frame += std::to_string(stack_frame->GetLineNumber());
    frame += ",\"column\":";
    frame += std::to_string(stack_frame->GetColumn());

    frame += "},";
    body_string += frame;
  }

  body_string.pop_back();
  body_string += "]}";

  return body_string;
}


std::string EnvInst::GetThreadName() const {
  return thread_name_;
}


void EnvInst::SetThreadName(const std::string& name) {
  thread_name_ = name;
}


SharedEnvInst EnvInst::GetInst(uint64_t thread_id) {
  auto* envlist = EnvList::Inst();
  ns_mutex::scoped_lock lock(envlist->map_lock_);
  auto item = envlist->env_map_.find(thread_id);
  return item != envlist->env_map_.end() ?
    item->second : SharedEnvInst();
}


SharedEnvInst EnvInst::GetCurrent(Isolate* isolate) {
  Environment* env = Environment::GetCurrent(isolate);
  return env == nullptr ? nullptr : env->envinst_;
}


SharedEnvInst EnvInst::GetCurrent(Local<Context> context) {
  Environment* env = Environment::GetCurrent(context);
  return env == nullptr ? nullptr : env->envinst_;
}


EnvInst* EnvInst::GetEnvLocalInst(Isolate* isolate) {
  Environment* env = Environment::GetCurrent(isolate);
  return env == nullptr ? nullptr : env->envinst_.get();
}


SharedEnvInst EnvInst::Create(Environment* env) {
  SharedEnvInst envinst_sp(new EnvInst(env), [](EnvInst* e) { delete e; });
  return envinst_sp;
}


bool EnvInst::can_call_into_js() const {
  return env()->can_call_into_js();
}


const char* get_startuptime_name(const char* name) {
  if (strncmp(name, "environment", sizeof("environment")) == 0)
    return "loaded_environment";
  if (strncmp(name, "nodeStart", sizeof("nodeStart")) == 0)
    return "initialized_node";
  if (strncmp(name, "v8Start", sizeof("v8Start")) == 0)
    return "initialized_v8";
  if (strncmp(name, "loopStart", sizeof("loopStart")) == 0)
    return "loop_start";
  if (strncmp(name, "loopExit", sizeof("loopExit")) == 0)
    return "loop_exit";
  if (strncmp(name, "bootstrapComplete", sizeof("bootstrapComplete")) == 0)
    return "bootstrap_complete";
  return name;
}


// No need to propagate EnvInst as a shared_ptr since it's lifetime is directly
// tied to the lifetime of the handle running these commands.
void EnvInst::run_event_loop_cmds_(ns_async*, EnvInst* envinst) {
  CmdQueueStor stor;
  while (envinst->eloop_cmds_q_.dequeue(stor)) {
    // Make sure the passed envinst is the same as the EnvInst instance
    // retrieved from the queue. If they're not then the event loop command
    // was queued on the wrong EnvInst instance.
    CHECK_EQ(envinst, stor.envinst_sp.get());
    stor.cb(stor.envinst_sp, stor.data);
  }
}


void EnvInst::run_interrupt_msg_(ns_async*, EnvInst* envinst) {
  CmdQueueStor stor;
  // Need to disable access to JS from here, but first need to make sure the
  // Isolate still exists before trying to disable JS access.
  if (envinst->env() != nullptr) {
    Isolate::DisallowJavascriptExecutionScope scope(
        envinst->isolate(),
        Isolate::DisallowJavascriptExecutionScope::CRASH_ON_FAILURE);
    while (envinst->interrupt_cb_q_.dequeue(stor)) {
      stor.cb(stor.envinst_sp, stor.data);
    }
    return;
  }

  while (envinst->interrupt_cb_q_.dequeue(stor)) {
    stor.cb(stor.envinst_sp, stor.data);
  }
}


void EnvInst::run_interrupt_(Isolate* isolate, void*) {
  SharedEnvInst envinst_sp = GetCurrent(isolate);
  if (!envinst_sp) {
    return;
  }

  run_interrupt_msg_(nullptr, envinst_sp.get());
}


void EnvInst::run_interrupt_only_(Isolate* isolate, void*) {
  SharedEnvInst envinst_sp = GetCurrent(isolate);
  CmdQueueStor stor;

  if (!envinst_sp) {
    return;
  }

  while (envinst_sp->interrupt_only_cb_q_.dequeue(stor)) {
    stor.cb(stor.envinst_sp, stor.data);
  }
}


void EnvInst::handle_cleanup_cb_(Environment* env, uv_handle_t* handle, void*) {
  env->CloseHandle(handle, [](uv_handle_t*) { /* do something here? */ });
}


/* Calculate the exponential moving average using the Poisson window function
 * combined with a time constant adjustment so even though the calculation is
 * only done once every loop, the smoothing curve acts as if it was time-series
 * data.
 *
 * The expanded equation for this is:
 *
 *                           /-ΔT \
 *                           |----|
 *                           \ τ  /
 *    s   =  s      + (1 - e       ) * (x  - s     )
 *     t      (t-1)                      t    (t-1)
 *
 * Where:
 *    ΔT - the difference in time since the last calculation in seconds
 *    τ  - the time constant for the calculation in seconds
 *    x  - new value to add to the exponential rolling avg
 */
static double inc_rolling_avg(double avg, double val, double dur, double cor) {
  return avg + (1 - exp(-dur / cor)) * (val - avg);
}


// Update the exponentially weighted moving average.
static void update_avgs(double val, double* arr, double dur) {
  // Track moving average over minimal duration.
  arr[0] = inc_rolling_avg(arr[0], val, dur, 5);
  // Each n passed is calculated for 1 min, 5 min and 15 min.
  arr[1] = inc_rolling_avg(arr[1], val, dur, 60);
  arr[2] = inc_rolling_avg(arr[2], val, dur, 300);
  arr[3] = inc_rolling_avg(arr[3], val, dur, 900);
}


static std::string gen_unblocked_body(uint64_t blocked_for,
                                      uint64_t loop_id,
                                      uint64_t callback_cntr) {
  std::string body_string = "{\"blocked_for\":";
  body_string += std::to_string(blocked_for);
  body_string += ",\"loop_id\":";
  body_string += std::to_string(loop_id);
  body_string += ",\"callback_cntr\":";
  body_string += std::to_string(callback_cntr);
  body_string += "}";
  return body_string;
}


// Called every event loop iteration to update loop specific metrics.
void EnvInst::uv_metrics_cb_(nsuv::ns_prepare* handle, EnvInst* envinst) {
  uv_metrics_t* metrics = envinst->metrics_info();
  uint64_t metrics_cb_time = uv_hrtime();
  uint64_t idle_time = uv_metrics_idle_time(envinst->event_loop());
  uint64_t loop_duration;
  uint64_t loop_idle_time;
  uint64_t loop_proc_time;
  uint64_t events_procd;
  uint64_t events_waiting;
  uint64_t provider_delay;
  uint64_t proc_delay;
  double res_metric;

  DCHECK_EQ(handle, &envinst->metrics_handle_);

  uv_metrics_info(handle->get_loop(), envinst->metrics_info());

  if (metrics->events_waiting - envinst->prev_events_waiting_ > 0)
    envinst->loop_with_events_++;

  // Use the previous values to calculate the values for this loop iteration.
  loop_duration = metrics_cb_time - envinst->prev_metrics_cb_time_;
  loop_idle_time = idle_time - envinst->prev_loop_idle_time_;
  loop_proc_time = loop_duration - loop_idle_time;
  events_procd = metrics->events - envinst->prev_events_processed_;
  events_waiting = metrics->events_waiting - envinst->prev_events_waiting_;

  // Calculate aggregate time the waiting events sat in the event queue until
  // being received by the event loop under the assumption that all events were
  // uniformly received in time.
  // This is calculated by multiplying the number of events that were waiting
  // to be processed by the amount of time the previous loop iteration took to
  // execute, then divide by 2.
  // Don't worry about loosing the decimal part of the math. It's measured in
  // nanoseconds, and loosing sub-nanosecond parts has no effect.
  // TODO(trevnorris): if events_waiting == 0 wouldn't that also affect this?
  provider_delay = envinst->prev_loop_proc_time_ * events_waiting / 2;

  // Calculate aggregate time events waited to be processed after being
  // received by the event loop.
  // This is calculatd by multiplying how long the current loop iteration took
  // to complete by one minus the total events that were processed, then
  // divide by 2.
  // Reason for doing one minus the total number of events processed is because
  // the first event had zero wait time before processing began.
  // Don't worry about loosing the decimal part of the math. It's measured in
  // nanoseconds, and loosing sub-nanosecond parts has no effect.
  proc_delay = events_procd == 0 ? 0 : loop_proc_time * (events_procd - 1) / 2;

  // Calculate the responsiveness metric.
  res_metric = loop_proc_time == 0 || events_procd == 0 ? 0 : 1.0 *
    (provider_delay + proc_delay) / loop_proc_time;

  // The correction here is supposed to be increments of 1 sec. But since the
  // loop can happen at any time, change loop_duration as a percentage of 1
  // second.
  update_avgs(res_metric,
              envinst->res_arr_,
              1.0 * loop_duration / NANOS_PER_SEC);

  // Update the estimated lag time by using the provider_delay, but store it in
  // milliseconds.
  envinst->rolling_est_lag_ = inc_rolling_avg(
      envinst->rolling_est_lag_,
      events_waiting == 0 ? 0 : envinst->prev_loop_proc_time_ / 1e6,
      1.0 * loop_duration / NANOS_PER_SEC,
      1);

  // Accumulate and store the total provider and processing delay onto the
  // event loop instance.
  envinst->provider_delay_ += provider_delay;
  envinst->processing_delay_ += proc_delay;
  envinst->prev_loop_proc_time_ = loop_proc_time;
  envinst->prev_metrics_cb_time_ = metrics_cb_time;
  envinst->prev_loop_idle_time_ = idle_time;
  envinst->prev_events_processed_ = metrics->events;
  envinst->prev_events_waiting_ = metrics->events_waiting;

  if (UNLIKELY(envinst->reported_blocked_)) {
    // Only generate the stack and call the unblocked hook callbacks if the
    // body was already generated for OnBlockedLoopHook.
    if (envinst->blocked_body_created_) {
      EnvList::Inst()->unblocked_loop_q_.enqueue({
        EnvInst::GetInst(envinst->thread_id()),
        gen_unblocked_body(std::ceil(1.0 * loop_proc_time / MICROS_PER_SEC),
                           metrics->loop_count,
                           envinst->makecallback_cntr_),
      });
      int er = EnvList::Inst()->process_callbacks_msg_.send();
      CHECK_EQ(er, 0);
    }
    // Reset both conditions here so the next loop iteration can report
    // whether it's blocked.
    envinst->reported_blocked_ = false;
    envinst->blocked_body_created_ = false;
  }
}


void EnvInst::v8_gc_prologue_cb_(Isolate* isolate,
                                 GCType type,
                                 GCCallbackFlags flags,
                                 void* data) {
  EnvInst* envinst = static_cast<EnvInst*>(data);
  envinst->gc_start_ = uv_hrtime();
}


void EnvInst::v8_gc_epilogue_cb_(Isolate* isolate,
                                 GCType type,
                                 GCCallbackFlags flags,
                                 void* data) {
  MetricsStream::Type rm_type = MetricsStream::Type::kGcRegular;
  EnvInst* envinst = static_cast<EnvInst*>(data);
  double gc_dur = (uv_hrtime() - envinst->gc_start_) / 1000;

  uint64_t* gc_fields = envinst->gc_fields;

  gc_fields[kGcCount]++;
  if (type & (v8::kGCTypeMarkSweepCompact | v8::kGCTypeIncrementalMarking)) {
    gc_fields[kGcMajor]++;
    rm_type = MetricsStream::Type::kGcMajor;
  }
  if (flags & v8::kGCCallbackFlagCollectAllAvailableGarbage) {
    gc_fields[kGcFull]++;
    rm_type = MetricsStream::Type::kGcFull;
  }
  if (flags & v8::kGCCallbackFlagForced) {
    gc_fields[kGcForced]++;
    rm_type = MetricsStream::Type::kGcForced;
  }

  envinst->send_datapoint(rm_type, gc_dur);
  envinst->gc_ring_.push_back(gc_dur);
}


int EnvInst::CustomCommand(std::string req_id,
                           std::string command,
                           std::string args,
                           custom_command_cb_sig cb,
                           void* data) {
  nsuv::ns_mutex::scoped_lock lock(custom_command_stor_map_lock_);
  auto iter = custom_command_stor_map_.emplace(
      req_id,
      CustomCommandStor { command, args, cb, data });

  if (iter.second == false) {
    return UV_EEXIST;
  }

  int err = nsolid::RunCommand(EnvInst::GetInst(thread_id_),
                               CommandType::EventLoop,
                               custom_command_,
                               req_id);
  if (err) {
    custom_command_stor_map_.erase(iter.first);
  }

  return err;
}


int EnvInst::CustomCommandResponse(const std::string& req_id,
                                   const char* value,
                                   bool is_return) {
  CustomCommandStor stor;
  {
    ns_mutex::scoped_lock lock(custom_command_stor_map_lock_);
    auto el = custom_command_stor_map_.extract(req_id);
    if (el.empty()) {
      return UV_ENOENT;
    }

    stor = std::move(el.mapped());
  }

  stor.cb(req_id,
          stor.command,
          0,
          { !is_return, is_return ? std::string() : value },
          { is_return, is_return ? value : std::string() },
          stor.data);
  return 0;
}


EnvList::EnvList(): info_(nlohmann::json::object()) {
  int er;
  // Create event loop and new thread to run EnvList commands.
  uv_loop_init(&thread_loop_);
  er = process_callbacks_msg_.init(&thread_loop_, process_callbacks_, this);
  CHECK_EQ(er, 0);
  er = removed_env_msg_.init(&thread_loop_, removed_env_cb_, this);
  CHECK_EQ(er, 0);
  er = fill_tracing_ids_msg_.init(&thread_loop_, fill_tracing_ids_cb_, this);
  CHECK_EQ(er, 0);
  er = blocked_loop_timer_.init(&thread_loop_);
  CHECK_EQ(er, 0);
  er = gen_ptiles_timer_.init(&thread_loop_);
  CHECK_EQ(er, 0);
  er = map_lock_.init(true);
  CHECK_EQ(er, 0);
  er = command_lock_.init(true);
  CHECK_EQ(er, 0);
  er = info_lock_.init(true);
  CHECK_EQ(er, 0);
  er = configuration_lock_.init(true);
  CHECK_EQ(er, 0);
  er = exit_lock_.init(true);
  CHECK_EQ(er, 0);
  er = thread_.create(env_list_routine_, this);
  CHECK_EQ(er, 0);
}


EnvList::~EnvList() {
  int er;

  is_alive_.store(false, std::memory_order_relaxed);
  er = removed_env_msg_.send();
  CHECK_EQ(er, 0);
  er = thread_.join();
  CHECK_EQ(er, 0);

  uv_loop_close(&thread_loop_);
}


EnvList* EnvList::Inst() {
  static EnvList env_list_;
  return &env_list_;
}


std::string EnvList::AgentId() {
  return agent_id_;
}

void EnvList::OnConfigurationHook(
      void* data,
      internal::on_configuration_hook_proxy_sig proxy,
      internal::deleter_sig deleter) {
  nlohmann::json config = current_config();

  on_config_hook_list_.push_back(
    { proxy, nsolid::internal::user_data(data, deleter) });
  if (!config.is_null())
    nsolid::QueueCallback(proxy, config.dump(), data);
}


void EnvList::EnvironmentCreationHook(
      void* data,
      internal::thread_added_hook_proxy_sig proxy,
      internal::deleter_sig deleter) {
  EnvHookStor stor { proxy, nsolid::internal::user_data(data, deleter) };

  std::map<uint64_t, SharedEnvInst> env_map;
  {
    // Copy the envinst map so we don't need to keep it locked the entire time.
    ns_mutex::scoped_lock lock(map_lock_);
    env_map = env_map_;
  }

  // Call the creation hook for all EnvInst that are alive.
  for (auto entry : env_map) {
    auto envinst_sp = entry.second;
    EnvInst::Scope scp(envinst_sp);
    if (scp.Success()) {
      proxy(envinst_sp, data);
    }
  }

  env_creation_list_.push_back(std::move(stor));
}


void EnvList::EnvironmentDeletionHook(
    void* data,
    internal::thread_removed_hook_proxy_sig proxy,
    internal::deleter_sig deleter) {
  env_deletion_list_.push_back(
    { proxy, nsolid::internal::user_data(data, deleter) });
}


int EnvList::QueueCallback(q_cb_sig cb, void* data) {
  queued_cb_q_.enqueue({ cb, data });
  return process_callbacks_msg_.send();
}

void EnvList::OnBlockedLoopHook(
    uint64_t threshold,
    void* data,
    internal::on_block_loop_hook_proxy_sig proxy,
    internal::deleter_sig deleter) {
  blocked_hooks_list_.push_back(
    { threshold, proxy, nsolid::internal::user_data(data, deleter) });
  if (threshold < min_blocked_threshold_)
    min_blocked_threshold_ = threshold;
}

void EnvList::OnUnblockedLoopHook(
    void* data,
    internal::on_unblock_loop_hook_proxy_sig proxy,
    internal::deleter_sig deleter) {
  // Using BlockedLoopStor because it's easier than duplicating a bunch of code,
  // but that means some value needs to be passed in for threshold.
  unblocked_hooks_list_.push_back(
    { 0, proxy, nsolid::internal::user_data(data, deleter) });
}


int EnvList::QueueCallback(q_cb_sig cb, uint64_t timeout, void* data) {
  QCbTimeoutStor* stor = new (std::nothrow) QCbTimeoutStor({
      cb,
      data,
      q_cb_timeout_cb_,
      timeout,
      uv_hrtime() });
  if (stor == nullptr)
    return UV_ENOMEM;
  q_cb_create_timeout_.enqueue(stor);
  return process_callbacks_msg_.send();
}


std::string EnvList::CurrentConfig() {
  ns_mutex::scoped_lock lock(configuration_lock_);
  return current_config_.dump();
}


nlohmann::json EnvList::CurrentConfigJSON() {
  ns_mutex::scoped_lock lock(configuration_lock_);
  return current_config_;
}


void EnvList::AddEnv(Environment* env) {
  SharedEnvInst envinst_sp = EnvInst::Create(env);

  {
    ns_mutex::scoped_lock lock(map_lock_);
    if (env->is_main_thread()) {
      main_thread_id_ = env->thread_id();
    }
    env_map_.emplace(env->thread_id(), envinst_sp);
  }

  {
    ns_mutex::scoped_lock lock(envinst_sp->startup_times_lock_);
    const AliasedFloat64Array& ps = env->performance_state()->milestones;
    double val;
#define V(name, str)                                                           \
    val = ps[performance::NODE_PERFORMANCE_MILESTONE_##name];                  \
    if (val > 0)                                                               \
      envinst_sp->startup_times_.insert({                                      \
          get_startuptime_name(str), static_cast<uint64_t>(val) });
    NODE_PERFORMANCE_MILESTONES(V)
#undef V
  }

  // Add this instance to env. It's alright to add it directly since the
  // lifetime of EnvInst is always greater than the lifetime of Environment.
  env->envinst_ = envinst_sp;

  // Add GC callbacks to track all types of GC events.
  env->isolate()->AddGCPrologueCallback(EnvInst::v8_gc_prologue_cb_,
                                        envinst_sp.get());
  env->isolate()->AddGCEpilogueCallback(EnvInst::v8_gc_epilogue_cb_,
                                        envinst_sp.get());

  // Run EnvironmentCreationHook callbacks.
  env_creation_list_.for_each([envinst_sp](auto& stor) {
    stor.cb(envinst_sp, stor.data.get());
  });
}


void EnvList::RemoveEnv(Environment* env) {
  SharedEnvInst envinst_sp = env->envinst_;
  CHECK_NOT_NULL(envinst_sp);

  // Erase this instance from the global map so it can no longer be accessed.
  {
    ns_mutex::scoped_lock lock(map_lock_);
#if defined(DEBUG)
    auto it = env_map_.find(env->thread_id());
    CHECK(it != env_map_.end());
    CHECK_EQ(envinst_sp, it->second);
#endif
    // Remove the main thread id if the main thread is being removed.
    if (main_thread_id_ == env->thread_id()) {
      main_thread_id_ = 0xFFFFFFFFFFFFFFFF;
    }
    env_map_.erase(env->thread_id());
  }

  // End any pending CPU profiles. This has to be done before removing the
  // EnvList from env_map_ so the checks in StopProfilingSync() pass.
  NSolidCpuProfiler::Inst()->StopProfilingSync(envinst_sp);
  NSolidHeapSnapshot::Inst()->StopTrackingHeapObjects(envinst_sp);

  // Remove the GC prologue and epilogue callbacks just to be safe.
  envinst_sp->env()->isolate()->RemoveGCPrologueCallback(
      EnvInst::v8_gc_prologue_cb_, envinst_sp.get());
  envinst_sp->env()->isolate()->RemoveGCEpilogueCallback(
      EnvInst::v8_gc_epilogue_cb_, envinst_sp.get());

  // End any pending spans and notify the user.
  if (env->is_main_thread()) {
    tracer_.endPendingSpans();
  }

  // Notify the user that the Environment is shutting down. Do this before all
  // the fields are erased so they can collect the last bit of data.
  env_deletion_list_.for_each([&envinst_sp](auto& stor) {
    stor.cb(envinst_sp, stor.data.get());
  });

  // Cleanup the RunCommand queues just to be sure no dangling SharedEnvInst
  // references are left after the Environment is gone and the EnvInst instance
  // can be deleted.
  EnvInst::CmdQueueStor stor;
  while (envinst_sp->eloop_cmds_q_.dequeue(stor)) {
    stor.cb(stor.envinst_sp, stor.data);
  }

  while (envinst_sp->interrupt_cb_q_.dequeue(stor)) {
    stor.cb(stor.envinst_sp, stor.data);
  }

  while (envinst_sp->interrupt_only_cb_q_.dequeue(stor)) {
    stor.cb(stor.envinst_sp, stor.data);
  }

  // Don't allow execution to continue in case a RunCommand() is running in
  // another thread since they might need access to Environment specific
  // resources (like the Isolate) that won't be valid after this returns.
  EnvInst::Scope lock(envinst_sp);
  CHECK(lock.Success());

  // Don't reset isolate_ or event_loop_ because those are returned as constexpr
  // and only accessed from another thread if the env still exists and has been
  // Scope locked.
  envinst_sp->env_.store(nullptr, std::memory_order_relaxed);

  // Remove the instance from env
  env->envinst_.reset();
}


std::string EnvList::GetInfo() {
  ns_mutex::scoped_lock lock(info_lock_);
  return info_.dump();
}


void EnvList::StoreInfo(const std::string& info) {
  ns_mutex::scoped_lock lock(info_lock_);
  info_ = nlohmann::json::parse(info, nullptr, false);
  CHECK(!info_.is_discarded());
}


void EnvList::UpdateConfig(const nlohmann::json& config) {
  nlohmann::json curr;
  nlohmann::json old;

  {
    ns_mutex::scoped_lock lock(configuration_lock_);
    old = current_config_;
    current_config_.merge_patch(config);
    curr = current_config_;
  }

  // If the actual configuration hasn't changed, don't call the hook
  if (!nlohmann::json::diff(old, curr).empty()) {
    current_config_version_++;
    auto it = config.find("promiseTracking");
    if (it != config.end()) {
      bool tracking = *it;
      PromiseTracking(tracking);
    }

    it = config.find("otlp");
    if (it != config.end() && !it->is_null()) {
      otlp::OTLPAgent::Inst()->start();
    }

    it = config.find("statsd");
    if (it != config.end() && !it->is_null()) {
      statsd::StatsDAgent::Inst()->start();
    }

    // If tags have changed, update info_ accordingly
    it = config.find("tags");
    if (it != config.end()) {
      info_["tags"] = *it;
    }

    on_config_string_q_.enqueue(curr.dump());
    int er = process_callbacks_msg_.send();
    CHECK_EQ(er, 0);
  }
}


void EnvList::UpdateConfig(const std::string& config_s) {
  auto config = nlohmann::json::parse(config_s, nullptr, false);
  CHECK(!config.is_discarded());
  UpdateConfig(config);
}


void EnvList::SetupExitHandlers() {
  // Handle uncaught throws in C++
  std::set_terminate(exit_handler_);
#ifdef __POSIX__
  // Setup Signal Handlers
  setup_signal_handler(SIGINT);
  setup_signal_handler(SIGTERM);
  setup_signal_handler(SIGHUP);
#endif
}


void EnvList::SetExitCode(int code) {
  exit_code_ = code;
}


void EnvList::AtExitHook(at_exit_sig cb,
                         void* data,
                         internal::deleter_sig deleter) {
  at_exit_hook_list_.push_back(
    { cb, nsolid::internal::user_data(data, deleter) });
}


void EnvList::DoSetExitError(v8::Isolate* isolate,
                             const v8::Local<v8::Value>& error,
                             const v8::Local<v8::Message>& message,
                             std::string* msg,
                             std::string* stack) {
  CHECK(isolate->InContext());
  Local<Context> context = isolate->GetCurrentContext();
  Environment* env = Environment::GetCurrent(context);

  if (!error.IsEmpty() && error->IsObject()) {
    auto stack_mv = error.As<Object>()->Get(env->context(),
                                            env->stack_string());
    if (!stack_mv.IsEmpty()) {
      String::Utf8Value stack_val(isolate, stack_mv.ToLocalChecked());
      *stack = *stack_val;
    }
  }

  Local<Value> message_v;
  if (!message.IsEmpty()) {
    message_v = message->Get();
  } else if (!error.IsEmpty() && error->IsObject()) {
    auto message_mv = error.As<Object>()->Get(env->context(),
                                              env->message_string());
    if (!message_mv.IsEmpty()) {
      message_v = message_mv.ToLocalChecked();
    }
  }

  if (!message_v.IsEmpty() && !message_v->IsUndefined()) {
    String::Utf8Value message_val(isolate, message_v);
    *msg = *message_val;
  }
}


void EnvList::SetExitError(Isolate* isolate,
                           const Local<Value>& error,
                           const Local<Message>& message) {
  std::string msg;
  std::string stack;
  DoSetExitError(isolate, error, message, &msg, &stack);
  ns_mutex::scoped_lock lock(exit_lock_);
  exit_error_ =
    std::make_unique<std::tuple<std::string, std::string>>(msg, stack);
}


void EnvList::SetSavedExitError(Isolate* isolate,
                                const Local<Value>& error) {
  Local<Message> message;
  std::string msg;
  std::string stack;
  DoSetExitError(isolate, error, message, &msg, &stack);
  ns_mutex::scoped_lock lock(exit_lock_);
  saved_exit_error_ =
    std::make_unique<std::tuple<std::string, std::string>>(msg, stack);
}


void EnvList::ClearSavedExitError() {
  ns_mutex::scoped_lock lock(exit_lock_);
  saved_exit_error_.reset(nullptr);
}


int EnvList::GetExitCode() const {
  return exit_code_;
}


std::tuple<std::string, std::string>* EnvList::GetExitError() {
  ns_mutex::scoped_lock lock(exit_lock_);
  return exit_error_ ? exit_error_.get() : saved_exit_error_.get();
}


void EnvList::PromiseTracking(bool promiseTracking) {
  decltype(env_map_) env_map;
  {
    // Copy the envinst map so we don't need to keep it locked the entire time.
    ns_mutex::scoped_lock lock(map_lock_);
    env_map = env_map_;
  }

  for (auto& entry : env_map) {
    EnvInst* envinst = entry.second.get();
    if (envinst->env()->nsolid_track_promises_fn().IsEmpty())
      continue;

    int er = EnvInst::RunCommand(
      EnvInst::GetInst(envinst->thread_id()),
      promiseTracking ? enable_promise_tracking_ : disable_promise_tracking_,
      nullptr,
      CommandType::InterruptOnly);
    if (er) {
      // Nothing to do here, really.
    }
  }
}


void EnvList::UpdateTracingFlags(uint32_t flags) {
  decltype(env_map_) env_map;
  {
    // Copy the envinst map so we don't need to keep it locked the entire time.
    ns_mutex::scoped_lock lock(map_lock_);
    env_map = env_map_;
  }

  for (auto& entry : env_map) {
    SharedEnvInst envinst = entry.second;
    int er = RunCommand(envinst,
                        CommandType::InterruptOnly,
                        update_tracing_flags,
                        flags);
    if (er) {
      // Nothing to do here, really.
    }
  }
}


void EnvList::datapoint_cb_(std::queue<MetricsStream::Datapoint>&& q) {
  // It runs in the nsolid thread
  if (q.empty()) {
    return;
  }
  MetricsStream::metrics_stream_bucket bucket;
  bucket.reserve(q.size());
  while (!q.empty()) {
    MetricsStream::Datapoint& dp = q.front();
    auto envinst_sp = EnvInst::GetInst(dp.thread_id);
    if (envinst_sp != nullptr)
      envinst_sp->add_metric_datapoint_(dp.type, dp.value);

    bucket.emplace_back(std::move(dp));
    q.pop();
  }

  EnvList::Inst()->metrics_stream_hook_list_.for_each([&](auto& stor) {
    MetricsStream::metrics_stream_bucket filtered_bucket;
    std::copy_if(bucket.begin(),
                 bucket.end(),
                 std::back_inserter(filtered_bucket),
                 [&stor](const MetricsStream::Datapoint& dp) {
                   return static_cast<uint32_t>(dp.type) & stor.flags;
                 });
    stor.cb(stor.stream, filtered_bucket, stor.data.get());
  });
}


void EnvInst::send_datapoint(MetricsStream::Type type,
                             double value) {
  EnvList* envlist = EnvList::Inst();
  double ts = 0;
  if (has_metrics_stream_hooks_) {
    ts = (PERFORMANCE_NOW() - performance::timeOrigin) / 1e6 +
         envlist->time_origin_;
  }

  envlist->datapoints_q_.Enqueue({ thread_id_, ts, type, value });
}


void EnvList::send_trace_data(SpanItem&& item) {
  span_item_q_.Enqueue(std::move(item));
}


void EnvList::get_blocked_loop_body_(SharedEnvInst envinst_sp, void*) {
  // It's possible that between queue'ing this callback and reaching this point
  // the event loop has become unblocked. If that's the case then there's no
  // need to generate the blocked stack trace.
  if (!envinst_sp->reported_blocked_)
    return;

  auto body = envinst_sp->GetOnBlockedBody();

  if (body.empty())
    return;

  EnvList* envlist = EnvList::Inst();
  envlist->blocked_loop_q_.enqueue({ envinst_sp, body });
  int er = envlist->process_callbacks_msg_.send();
  CHECK_EQ(er, 0);
  envinst_sp->blocked_body_created_ = true;
}


void EnvList::DoExit(bool on_signal) {
  bool expected = false;

  exiting_.compare_exchange_strong(expected, true);
  if (expected) {
    return;
  }

  // Stop profiling in the main thread if any in progress, but only if not due
  // a terminating signal. Don't try to stop profiling inside a signal handler
  // because terrible things can happen, like crashes because the signal handler
  // started executing while in the middle of a GC cycle.
  bool profile_stopped = false;
  if (!on_signal) {
    int r = nsolid::CpuProfiler::StopProfileSync(GetEnvInst(0));
    profile_stopped = r == 0;
  }

  at_exit_hook_list_.for_each([&on_signal,
                               &profile_stopped](const AtExitStor& stor) {
    stor.cb(on_signal, profile_stopped, stor.data.get());
  });
}


void EnvList::exit_handler_() {
  EnvList* envlist = EnvList::Inst();
  CHECK_NOT_NULL(envlist);
  envlist->DoExit(false);
}


#ifdef __POSIX__
void EnvList::signal_handler_(int signum, siginfo_t* info, void* ucontext) {
  EnvList* envlist = EnvList::Inst();
  envlist->SetExitCode(signum);

  // SignalExit will re-raise the signal so remove the handler,
  // otherwise this will call ourself again
  struct sigaction act;
  memset(&act, '\0', sizeof(act));
  act.sa_handler = SIG_DFL;
  // Block SIGPROF during execution of the signal handler avoiding possible
  // crashes while CPU profiling
  sigaddset(&act.sa_mask, SIGPROF);
  int rc = sigaction(signum, &act, nullptr);
  if (rc < 0) {
    fprintf(stderr, "Fatal error setting signal handler (%d)\n", rc);
    exit(1);
  }

  // Avoid calling destructors on signal handlers, only bad things can happen
  envlist->DoExit(true);

  // Invoke node's fatal exit handler
  node::SignalExit(signum, info, ucontext);
}


void EnvList::setup_signal_handler(int signum) {
  struct sigaction act;
  struct sigaction oldact;
  int rc;

  // If another handler is in place besides the node default handler, don't
  // replace it. If this is the case, it's probably libuv's handler which is
  // what fires SIG* events.  If user-code exits it will be handled by the
  // atexit handler instead of our signal handler.
  rc = sigaction(signum, nullptr, &oldact);
  if (rc < 0) {
    fprintf(stderr, "Fatal error checking signal handler state (%d)\n", rc);
    exit(1);
  }

  if (oldact.sa_handler == SIG_DFL || oldact.sa_sigaction == node::SignalExit) {
    memset(&act, '\0', sizeof(act));
    act.sa_sigaction = &signal_handler_;
    rc = sigaction(signum, &act, nullptr);
    if (rc < 0) {
      fprintf(stderr, "Fatal error setting signal handler (%d)\n", rc);
      exit(1);
    }
  }
}
#endif


void EnvList::process_callbacks_(ns_async*, EnvList* envlist) {
  // Prevent process.exit() to force exit the process while the command queue
  // is being processed.
  ns_mutex::scoped_lock cmd_lock(Inst()->command_lock_);

  // Process all EnvList::QueueCallback calls.
  QCbStor envlist_stor;
  while (envlist->queued_cb_q_.dequeue(envlist_stor)) {
    envlist_stor.cb(envlist_stor.data);
  }

  // Process config update hooks.
  std::string config;
  while (envlist->on_config_string_q_.dequeue(config)) {
    envlist->on_config_hook_list_.for_each([&config](auto& stor) {
      stor.cb(config, stor.data.get());
    });
  }

  QCbTimeoutStor* to_stor = nullptr;
  while (envlist->q_cb_create_timeout_.dequeue(&to_stor)) {
    int64_t timeout =
      to_stor->timeout - (uv_hrtime() - to_stor->hrtime) / MICROS_PER_SEC;
    // If the amount of time that's passed since this was queued is greater
    // than the timeout time, then call the callback immediately.
    if (timeout < 0) {
      to_stor->timer_cb(nullptr, to_stor);
      continue;
    }
    // Here we create the timeout and set it using the delta in time as a
    // correction. The timer instance is closed and deleted in q_cb_timeout_cb_.
    ns_timer* timer = new ns_timer();
    int er = timer->init(&envlist->thread_loop_);
    CHECK_EQ(er, 0);
    er = timer->start(to_stor->timer_cb, timeout, 0, to_stor);
    timer->unref();
    CHECK_EQ(er, 0);
  }

  std::tuple<SharedEnvInst, std::string> blocked;
  while (envlist->blocked_loop_q_.dequeue(blocked)) {
    envlist->blocked_hooks_list_.for_each([&blocked](auto& stor) {
      stor.cb(std::get<SharedEnvInst>(blocked),
              std::get<std::string>(blocked),
              stor.data.get());
    });
  }

  std::tuple<SharedEnvInst, std::string> unblocked;
  while (envlist->unblocked_loop_q_.dequeue(unblocked)) {
    envlist->unblocked_hooks_list_.for_each([&unblocked](auto& stor) {
      stor.cb(std::get<SharedEnvInst>(unblocked),
              std::get<std::string>(unblocked),
              stor.data.get());
    });
  }
}


// It's important to know when the the thread needs to shutdown b/c any
// registered users will need to receive their last set of metrics and a
// notification that it'll be their last.
void EnvList::removed_env_cb_(ns_async*, EnvList* envlist) {
  envlist->removed_env_msg_.close();
  envlist->process_callbacks_msg_.close();
  envlist->fill_tracing_ids_msg_.close();
  envlist->blocked_loop_timer_.close();
  envlist->gen_ptiles_timer_.close();
}


void EnvList::env_list_routine_(ns_thread*, EnvList* envlist) {
  int er;
  er = envlist->blocked_loop_timer_.start(
      blocked_loop_timer_cb_, blocked_loop_interval, blocked_loop_interval);
  CHECK_EQ(er, 0);
  er = envlist->gen_ptiles_timer_.start(
      gen_ptiles_cb_, gen_ptiles_interval, gen_ptiles_interval);
  CHECK_EQ(er, 0);
  envlist->blocked_loop_timer_.unref();
  envlist->gen_ptiles_timer_.unref();
  envlist->fill_span_id_q();
  envlist->fill_trace_id_q();
  // We initialize from the N|Solid thread and not the EnvList constructor as
  // DispatchQueue::Init() actually calls EnvList::Inst()
  er = envlist->datapoints_q_.Init(
      [](int er, DispatchQueue<MetricsStream::Datapoint>* q) {
    CHECK_EQ(er, 0);
    er = q->Start(datapoints_q_interval,
                  datapoints_q_max_size,
                  datapoint_cb_);
    CHECK_EQ(er, 0);
  });
  CHECK_EQ(er, 0);
  er = envlist->span_item_q_.Init([](int er, DispatchQueue<SpanItem>* q) {
    CHECK_EQ(er, 0);
  });
  CHECK_EQ(er, 0);
  er = uv_run(&envlist->thread_loop_, UV_RUN_DEFAULT);
  CHECK_EQ(er, 0);
}


void EnvList::blocked_loop_timer_cb_(ns_timer*) {
  EnvList* envlist = EnvList::Inst();
  uint64_t now = uv_hrtime();
  // Adjust from milliseconds to nanoseconds.
  uint64_t min_threshold_ns = envlist->min_blocked_threshold_ * 1000000;
  std::list<SharedEnvInst> envinst_list;
  decltype(envlist->env_map_) env_map;

  // While this will use more memory, it'll also have the least amount of
  // impact when creating/destroying threads.
  {
    ns_mutex::scoped_lock lock(envlist->map_lock_);
    env_map = envlist->env_map_;
  }

  // Now that everything's been copied out, no need for the lock.
  for (auto& item : env_map) {
    auto envinst_sp = item.second;
    // TODO(trevnorris): REMOVE provider_times so libuv don't need to use the
    // floating patch.
    uint64_t exit_time = envinst_sp->provider_times().second;
    uint64_t blocked_time = exit_time == 0 ? 0 : now - exit_time;

    if (blocked_time < min_threshold_ns || envinst_sp->reported_blocked_)
      continue;

    envinst_sp->blocked_busy_diff_ = blocked_time;
    envinst_list.push_back(envinst_sp);
  }

  // No threads are above the threshold. So return early.
  if (envinst_list.empty())
    return;

  // If the event loop has been blocked over the specified threshold then
  // queue a callback to run as an Interrupt from the event loop's thread and
  // generate the stack.
  {
    envlist->blocked_hooks_list_.for_each([&](auto& stor) {
      for (auto& envinst_sp : envinst_list) {
        uint64_t delay_ms = envinst_sp->blocked_busy_diff_ / 1000000;
        if (stor.threshold > delay_ms || envinst_sp->reported_blocked_)
          continue;
        // This needs to be set before calling RunCommand since V8 may call
        // the interrupt synchronously.
        envinst_sp->reported_blocked_ = true;
        // No need to check the return error. If the thread no longer exists
        // then there's nothing to do.
        EnvInst::RunCommand(envinst_sp,
                            get_blocked_loop_body_,
                            nullptr,
                            CommandType::Interrupt);
      }
    });
  }
}


// This is a dirty simple percentile tracker. Since we support streaming metrics
// a better solution is to stream them all and do more advanced percentile
// calculations where it won't affect the process.
void EnvList::gen_ptiles_cb_(ns_timer*) {
  EnvList* envlist = EnvList::Inst();
  decltype(EnvList::env_map_) env_map;

  {
    // Copy the envinst map so we don't need to keep it locked the entire time.
    ns_mutex::scoped_lock lock(envlist->map_lock_);
    env_map = envlist->env_map_;
  }

  // Generate percentiles for all EnvInst that are alive.
  for (auto entry : env_map) {
    auto envinst_sp = entry.second;
    calculateHttpDnsPtiles(envinst_sp->dns_bucket_,
                           envinst_sp->dns_median_,
                           envinst_sp->dns99_ptile_);
    calculateHttpDnsPtiles(envinst_sp->client_bucket_,
                           envinst_sp->http_client_median_,
                           envinst_sp->http_client99_ptile_);
    calculateHttpDnsPtiles(envinst_sp->server_bucket_,
                           envinst_sp->http_server_median_,
                           envinst_sp->http_server99_ptile_);
  }
}


void EnvList::promise_tracking_(SharedEnvInst envinst_sp, bool track) {
  Environment* env = envinst_sp->env();
  if (env->nsolid_track_promises_fn().IsEmpty() ||
      !envinst_sp->can_call_into_js()) {
    return;
  }

  Isolate* isolate = envinst_sp->isolate();
  HandleScope handle_scope(isolate);
  Context::Scope context_scope(env->context());
  Local<Value> argv[] = {
    v8::Boolean::New(isolate, track)
  };

  // We don't care if Call throws or exits. So ignore the return value.
  env->nsolid_track_promises_fn()->Call(env->context(),
                                        env->process_object(),
                                        arraysize(argv),
                                        argv).FromMaybe(Local<Value>());
}


void EnvList::enable_promise_tracking_(SharedEnvInst envinst_sp, void*) {
  EnvList::promise_tracking_(envinst_sp, true);
}


void EnvList::disable_promise_tracking_(SharedEnvInst envinst_sp, void*) {
  EnvList::promise_tracking_(envinst_sp, false);
}


void EnvList::update_tracing_flags(SharedEnvInst envinst_sp, uint32_t flags) {
  Isolate* isolate = Isolate::TryGetCurrent();
  DCHECK_EQ(envinst_sp->isolate(), isolate);

  // update flags
  envinst_sp->trace_flags_ = flags;

  Environment* env = envinst_sp->env();
  if (env->nsolid_toggle_tracing_fn().IsEmpty() ||
      !envinst_sp->can_call_into_js()) {
    return;
  }

  HandleScope handle_scope(isolate);
  Context::Scope context_scope(env->context());
  Local<Value> argv[] = {
    v8::Boolean::New(isolate, flags > 0)
  };

  // We don't care if Call throws or exits. So ignore the return value.
  env->nsolid_toggle_tracing_fn()->Call(env->context(),
                                        env->process_object(),
                                        arraysize(argv),
                                        argv).FromMaybe(Local<Value>());
}


void EnvList::fill_tracing_ids_cb_(nsuv::ns_async*, EnvList* envlist) {
  envlist->fill_span_id_q();
  envlist->fill_trace_id_q();
}


void EnvList::q_cb_timeout_cb_(nsuv::ns_timer* handle, QCbTimeoutStor* ptr) {
  QCbTimeoutStor* stor = static_cast<QCbTimeoutStor*>(ptr);
  stor->cb(stor->data);
  // This callback may be called manually, so check if handle is nullptr.
  if (handle)
    handle->close_and_delete();
  delete stor;
}


void EnvList::popSpanId(std::string& span_id) {
  int er;
  size_t s;
  if (!span_id_q_.dequeue(span_id, s)) {
    // Generate the buffer synchronously
    unsigned char buf[8];
    utils::generate_random_buf(buf, sizeof(buf));
    span_id = utils::buffer_to_hex(buf, sizeof(buf));
    // Notify the nsolid thread to fill the q
    er = fill_tracing_ids_msg_.send();
    CHECK_EQ(er, 0);
    return;
  }

  if (s < SPAN_ID_Q_MIN_THRESHOLD) {
    // Notify the nsolid thread to fill the q
    er = fill_tracing_ids_msg_.send();
    CHECK_EQ(er, 0);
  }
}


void EnvList::popTraceId(std::string& trace_id) {
  int er;
  size_t s;
  if (!trace_id_q_.dequeue(trace_id, s)) {
    // Generate the buffer synchronously
    unsigned char buf[16];
    utils::generate_random_buf(buf, sizeof(buf));
    trace_id = utils::buffer_to_hex(buf, sizeof(buf));
    // Notify the nsolid thread to fill the q
    er = fill_tracing_ids_msg_.send();
    CHECK_EQ(er, 0);
    return;
  }

  if (s < TRACE_ID_Q_MIN_THRESHOLD) {
    // Notify the nsolid thread to fill the q
    er = fill_tracing_ids_msg_.send();
    CHECK_EQ(er, 0);
  }
}


void EnvList::fill_span_id_q() {
  unsigned char buf[SPAN_ID_Q_REFILL_ITEMS*8];
  utils::generate_random_buf(buf, sizeof(buf));
  for (unsigned int i = 0; i < SPAN_ID_Q_REFILL_ITEMS; ++i) {
    span_id_q_.enqueue(utils::buffer_to_hex(buf + i*8, 8));
  }
}


void EnvList::fill_trace_id_q() {
  unsigned char buf[TRACE_ID_Q_REFILL_ITEMS*16];
  utils::generate_random_buf(buf, sizeof(buf));
  for (unsigned int i = 0; i < TRACE_ID_Q_REFILL_ITEMS; ++i) {
    trace_id_q_.enqueue(utils::buffer_to_hex(buf + i*16, 16));
  }
}


void EnvInst::custom_command_(SharedEnvInst envinst_sp,
                              const std::string req_id) {
  auto error_cb = [](const std::string& req_id,
                     const CustomCommandStor& stor,
                     int err,
                     SharedEnvInst& envinst_sp) {
    stor.cb(req_id,
            stor.command,
            err,
            { false, std::string() },
            { false, std::string() },
            stor.data);
    ns_mutex::scoped_lock lock(envinst_sp->custom_command_stor_map_lock_);
    envinst_sp->custom_command_stor_map_.erase(req_id);
  };

  CustomCommandStor stor;
  {
    ns_mutex::scoped_lock lock(envinst_sp->custom_command_stor_map_lock_);
    auto it = envinst_sp->custom_command_stor_map_.find(req_id);
    CHECK_NE(it, envinst_sp->custom_command_stor_map_.end());
    stor = it->second;
  }

  Environment* env = envinst_sp->env();
  if (env->nsolid_on_command_fn().IsEmpty() ||
      !envinst_sp->can_call_into_js()) {
    error_cb(req_id, stor, UV_EINVAL, envinst_sp);
    return;
  }

  Isolate* isolate = envinst_sp->isolate();
  HandleScope handle_scope(isolate);
  Context::Scope context_scope(env->context());
  Local<Value> argv[] = {
    v8::String::NewFromUtf8(
      isolate,
      req_id.c_str(),
      v8::NewStringType::kNormal).ToLocalChecked(),
    v8::String::NewFromUtf8(
      isolate,
      stor.command.c_str(),
      v8::NewStringType::kNormal).ToLocalChecked(),
    v8::String::NewFromUtf8(
      isolate,
      stor.args.c_str(),
      v8::NewStringType::kNormal).ToLocalChecked()
  };

  Local<Value> ret = env->nsolid_on_command_fn()->Call(env->context(),
                                                       env->process_object(),
                                                       arraysize(argv),
                                                       argv).ToLocalChecked();
  int r = ret->Int32Value(env->context()).ToChecked();
  if (r != 0) {
    error_cb(req_id, stor, r, envinst_sp);
  }
}


void EnvInst::CustomCommandReqWeakCallback(
    const WeakCallbackInfo<EnvInst::CustomCommandGlobalReq>& info) {
  EnvInst* envinst = GetEnvLocalInst(info.GetIsolate());
  std::unique_ptr<CustomCommandGlobalReq> req(info.GetParameter());
  CHECK_NOT_NULL(req);
  ns_mutex::scoped_lock lock(envinst->custom_command_stor_map_lock_);
  envinst->custom_command_stor_map_.erase(req->req_id);
}


void EnvInst::add_metric_datapoint_(MetricsStream::Type type, double value) {
  DCHECK(utils::are_threads_equal(uv_thread_self(), EnvList::Inst()->thread()));
  switch (type) {
    case MetricsStream::Type::kDns:
    {
      dns_bucket_.push_back(value);
    }
    break;
    case MetricsStream::Type::kHttpClient:
    {
      client_bucket_.push_back(value);
    }
    break;
    case MetricsStream::Type::kHttpServer:
    {
      server_bucket_.push_back(value);
    }
    break;
    case MetricsStream::Type::kGcForced:
    case MetricsStream::Type::kGcFull:
    case MetricsStream::Type::kGcMajor:
    case MetricsStream::Type::kGcRegular:
    case MetricsStream::Type::kGc:
    break;
  }
}


TSList<EnvList::MetricsStreamHookStor>::iterator
EnvList::AddMetricsStreamHook(uint32_t flags,
                              MetricsStream* stream,
                              MetricsStream::metrics_stream_proxy_sig cb,
                              internal::deleter_sig deleter,
                              void* data) {
  auto it = metrics_stream_hook_list_.push_back(
    { flags, stream, cb, nsolid::internal::user_data(data, deleter) });
  if (metrics_stream_hook_list_.size() == 1)
    UpdateHasMetricsStreamHooks(true);
  return it;
}


void EnvList::RemoveMetricsStreamHook(
    TSList<EnvList::MetricsStreamHookStor>::iterator it) {
  metrics_stream_hook_list_.erase(it);
  if (metrics_stream_hook_list_.size() == 0)
    UpdateHasMetricsStreamHooks(false);
}


void EnvList::update_has_metrics_stream_hooks(SharedEnvInst envinst_sp,
                                              bool has_metrics) {
  DCHECK_EQ(envinst_sp->isolate(), v8::Isolate::TryGetCurrent());

  envinst_sp->has_metrics_stream_hooks_ = has_metrics;
}


void EnvList::UpdateHasMetricsStreamHooks(bool has_metrics) {
  decltype(env_map_) env_map;
  {
    // Copy the envinst map so we don't need to keep it locked the entire time.
    ns_mutex::scoped_lock lock(map_lock_);
    env_map = env_map_;
  }

  for (auto& entry : env_map) {
    SharedEnvInst envinst = entry.second;
    int er = RunCommand(envinst,
                        CommandType::InterruptOnly,
                        update_has_metrics_stream_hooks,
                        has_metrics);
    if (er) {
      // Nothing to do here, really.
    }
  }
}


void EnvInst::get_heap_stats_(EnvInst* envinst,
                              ThreadMetrics::MetricsStor* stor) {
  HeapStatistics s;
  HeapCodeStatistics c;

  envinst->isolate()->GetHeapStatistics(&s);

  stor->total_heap_size = s.total_heap_size();
  stor->total_heap_size_executable = s.total_heap_size_executable();
  stor->total_physical_size = s.total_physical_size();
  stor->total_available_size = s.total_available_size();
  stor->used_heap_size = s.used_heap_size();
  stor->heap_size_limit = s.heap_size_limit();
  stor->malloced_memory = s.malloced_memory();
  stor->external_memory = s.external_memory();
  stor->peak_malloced_memory = s.peak_malloced_memory();
  stor->number_of_native_contexts = s.number_of_native_contexts();
  stor->number_of_detached_contexts = s.number_of_detached_contexts();
}


void calculateHttpDnsPtiles(
    std::vector<double>& bucket,  // NOLINT(runtime/references)
    std::atomic<double>& median,  // NOLINT(runtime/references)
    std::atomic<double>& ptile) {  // NOLINT(runtime/references)
  std::vector<double> vals;
  double med;
  double nn;

  // By moving the bucket we do not need to clear it later on.
  vals = std::move(bucket);

  calculatePtiles(&vals, &med, &nn);

  median = med;
  ptile = nn;
}


void calculatePtiles(std::vector<double>* vals, double* med, double* nn) {
  if (vals->size() == 0) {
    *med = 0;
    *nn = 0;
    return;
  }
  if (vals->size() == 1) {
    *med = vals->at(0);
    *nn = vals->at(0);
    return;
  }

  const auto n_it = vals->begin() + vals->size() * 0.99;
  std::nth_element(vals->begin(), n_it, vals->end());
  *nn = *n_it;

  if (vals->size() % 2 > 0) {
    const auto m_it = vals->begin() + vals->size() / 2;
    std::nth_element(vals->begin(), m_it, vals->end());
    *med = *m_it;
  } else {
    const auto m_it1 = vals->begin() + vals->size() / 2 - 1;
    const auto m_it2 = vals->begin() + vals->size() / 2 - 1;
    std::nth_element(vals->begin(), m_it1 , vals->end());
    std::nth_element(vals->begin(), m_it2 , vals->end());
    *med = ((*m_it1) + (*m_it2)) / 2;
  }
}


void EnvInst::get_gc_stats_(EnvInst* envinst,
                            ThreadMetrics::MetricsStor* stor) {
  uint64_t* gc_fields = envinst->gc_fields;
  stor->gc_count = gc_fields[kGcCount];
  stor->gc_forced_count = gc_fields[kGcForced];
  stor->gc_full_count = gc_fields[kGcFull];
  stor->gc_major_count = gc_fields[kGcMajor];
  stor->gc_dur_us_median = envinst->gc_ring_.percentile(0.5);
  stor->gc_dur_us99_ptile = envinst->gc_ring_.percentile(0.99);
}


void EnvInst::get_http_dns_stats_(EnvInst* envinst,
                                  ThreadMetrics::MetricsStor* stor) {
  double* js_counts = envinst->count_fields;
  stor->dns_count = js_counts[kDnsCount];
  stor->http_client_abort_count = js_counts[kHttpClientAbortCount];
  stor->http_client_count = js_counts[kHttpClientCount];
  stor->http_server_abort_count = js_counts[kHttpServerAbortCount];
  stor->http_server_count = js_counts[kHttpServerCount];

  stor->dns_median = envinst->dns_median_;
  stor->dns99_ptile = envinst->dns99_ptile_;
  stor->http_client_median = envinst->http_client_median_;
  stor->http_client99_ptile = envinst->http_client99_ptile_;
  stor->http_server_median = envinst->http_server_median_;
  stor->http_server99_ptile = envinst->http_server99_ptile_;

  stor->pipe_server_created_count =
    js_counts[kAsyncPipeServerCreatedCount];
  stor->pipe_server_destroyed_count =
    js_counts[kAsyncPipeServerDestroyedCount];
  stor->pipe_socket_created_count =
    js_counts[kAsyncPipeSocketCreatedCount];
  stor->pipe_socket_destroyed_count =
    js_counts[kAsyncPipeSocketDestroyedCount];
  stor->tcp_server_created_count =
    js_counts[kAsyncTcpServerCreatedCount];
  stor->tcp_server_destroyed_count =
    js_counts[kAsyncTcpServerDestroyedCount];
  stor->tcp_client_created_count =
    js_counts[kAsyncTcpSocketCreatedCount];
  stor->tcp_client_destroyed_count =
    js_counts[kAsyncTcpSocketDestroyedCount];
  stor->udp_socket_created_count =
    js_counts[kAsyncUdpSocketCreatedCount];
  stor->udp_socket_destroyed_count =
    js_counts[kAsyncUdpSocketDestroyedCount];
  stor->promise_created_count =
    js_counts[kAsyncPromiseCreatedCount];
  stor->promise_resolved_count =
    js_counts[kAsyncPromiseResolvedCount];
}


void EnvInst::get_event_loop_stats_(EnvInst* envinst,
                                    ThreadMetrics::MetricsStor* stor) {
  uv_metrics_t* metrics = envinst->metrics_info();
  uint64_t loop_idle_time = uv_metrics_idle_time(envinst->event_loop());
  uint64_t loop_diff = stor->current_hrtime_ - stor->prev_call_time_;
  uint64_t idle_diff = loop_idle_time - stor->prev_idle_time_;
  uint64_t proc_diff = loop_diff - idle_diff;
  uint64_t count_diff = metrics->loop_count - stor->loop_iterations;
  auto entry_exit = envinst->provider_times();
  uint64_t entry_time = entry_exit.first;
  uint64_t exit_time = entry_exit.second;

  // If both values are 0 then the event loop hasn't been entered yet. If this
  // is the case then use the starting time of the process as the exit_time.
  if (entry_time == 0 && exit_time == 0)
    exit_time = performance::timeOrigin;

  // Current, good, event loop metrics
  stor->loop_idle_time = loop_idle_time;
  stor->loop_iterations = metrics->loop_count;
  stor->loop_iter_with_events = envinst->loop_with_events_;
  stor->events_processed = metrics->events;
  stor->events_waiting = metrics->events_waiting;
  stor->provider_delay = envinst->provider_delay_;
  stor->processing_delay = envinst->processing_delay_;
  // This is likely never going to be exactly 0% since collecting these metrics
  // takes time out of the event loop to process.
  stor->loop_utilization = 1.0 * proc_diff / loop_diff;
  stor->res_5s = envinst->res_arr_[0];
  stor->res_1m = envinst->res_arr_[1];
  stor->res_5m = envinst->res_arr_[2];
  stor->res_15m = envinst->res_arr_[3];

  // Metrics for backwards compatibility.
  stor->loop_total_count = metrics->loop_count;
  stor->loop_avg_tasks = count_diff == 0 ? 0 :
    1.0 * (metrics->events - stor->events_processed) / count_diff;
  stor->loop_estimated_lag =
    (exit_time > 0 && stor->prev_call_time_ > exit_time) ?
    (stor->current_hrtime_ - exit_time) / 1e6 : envinst->rolling_est_lag_;
  stor->loop_idle_percent = (1 - stor->loop_utilization) * 100;

  stor->prev_call_time_ = stor->current_hrtime_;
  stor->prev_idle_time_ = loop_idle_time;
}


static void AgentId(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(
      OneByteString(args.GetIsolate(), EnvList::Inst()->AgentId().c_str()));
}


void BindingData::SlowPushClientBucket(
    const FunctionCallbackInfo<Value>& args) {
  DCHECK(args[0]->IsNumber());
  PushClientBucketImpl(Realm::GetBindingData<BindingData>(args),
                       args[0].As<Number>()->Value());
}


void BindingData::FastPushClientBucket(v8::Local<v8::Object> receiver,
                                       double val) {
  PushClientBucketImpl(FromJSObject<BindingData>(receiver), val);
}


void BindingData::PushClientBucketImpl(BindingData* data, double val) {
  data->env()->envinst_->PushClientBucket(val);
}


void BindingData::SlowPushDnsBucket(
    const FunctionCallbackInfo<Value>& args) {
  DCHECK(args[0]->IsNumber());
  PushDnsBucketImpl(Realm::GetBindingData<BindingData>(args),
                    args[0].As<Number>()->Value());
}


void BindingData::FastPushDnsBucket(v8::Local<v8::Object> receiver,
                                    double val) {
  PushDnsBucketImpl(FromJSObject<BindingData>(receiver), val);
}


void BindingData::PushDnsBucketImpl(BindingData* data, double val) {
  data->env()->envinst_->PushDnsBucket(val);
}


void BindingData::SlowPushServerBucket(
    const FunctionCallbackInfo<Value>& args) {
  DCHECK(args[0]->IsNumber());
  PushServerBucketImpl(Realm::GetBindingData<BindingData>(args),
                       args[0].As<Number>()->Value());
}


void BindingData::FastPushServerBucket(v8::Local<v8::Object> receiver,
                                       double val) {
  PushServerBucketImpl(FromJSObject<BindingData>(receiver), val);
}


void BindingData::PushServerBucketImpl(BindingData* data, double val) {
  data->env()->envinst_->PushServerBucket(val);
}


void BindingData::SlowPushSpanDataDouble(
    const FunctionCallbackInfo<Value>& args) {
  DCHECK_EQ(args.Length(), 3);
  DCHECK(args[0]->IsUint32());
  DCHECK(args[1]->IsUint32());
  DCHECK(args[2]->IsNumber());
  uint32_t trace_id = args[0].As<Uint32>()->Value();
  uint32_t type = args[1].As<Uint32>()->Value();
  double val = args[2].As<Number>()->Value();
  PushSpanDataDoubleImpl(Realm::GetBindingData<BindingData>(args),
                         trace_id,
                         type,
                         val);
}


void BindingData::FastPushSpanDataDouble(v8::Local<v8::Object> receiver,
                                         uint32_t trace_id,
                                         uint32_t type,
                                         double val) {
  PushSpanDataDoubleImpl(FromJSObject<BindingData>(receiver),
                         trace_id,
                         type,
                         val);
}


void BindingData::PushSpanDataDoubleImpl(BindingData* data,
                                         uint32_t trace_id,
                                         uint32_t type,
                                         double val) {
  Span::PropType prop_type = static_cast<Span::PropType>(type);
  auto prop = Span::createSpanProp<double>(prop_type, val);
  EnvInst* envinst = data->env()->envinst_.get();
  EnvList::Inst()->GetTracer()->pushSpanData(
      SpanItem{ trace_id, envinst->thread_id(), std::move(prop) });
}


void BindingData::SlowPushSpanDataUint64(
    const FunctionCallbackInfo<Value>& args) {
  DCHECK_EQ(args.Length(), 3);
  DCHECK(args[0]->IsUint32());
  DCHECK(args[1]->IsUint32());
  DCHECK(args[2]->IsNumber());
  uint32_t trace_id = args[0].As<Uint32>()->Value();
  uint32_t type = args[1].As<Uint32>()->Value();
  uint64_t val = args[2].As<Number>()->Value();
  PushSpanDataUint64Impl(Realm::GetBindingData<BindingData>(args),
                         trace_id,
                         type,
                         val);
}


void BindingData::FastPushSpanDataUint64(v8::Local<v8::Object> receiver,
                                         uint32_t trace_id,
                                         uint32_t type,
                                         uint64_t val) {
  PushSpanDataUint64Impl(FromJSObject<BindingData>(receiver),
                         trace_id,
                         type,
                         val);
}


void BindingData::PushSpanDataUint64Impl(BindingData* data,
                                         uint32_t trace_id,
                                         uint32_t type,
                                         uint64_t val) {
  Span::PropType prop_type = static_cast<Span::PropType>(type);
  auto prop = Span::createSpanProp<uint64_t>(prop_type, val);
  EnvInst* envinst = data->env()->envinst_.get();
  EnvList::Inst()->GetTracer()->pushSpanData(
      SpanItem{ trace_id, envinst->thread_id(), std::move(prop) });
}


static void PushSpanDataString(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  EnvInst* envinst = EnvInst::GetEnvLocalInst(isolate);
  DCHECK_NE(envinst, nullptr);
  DCHECK_EQ(args.Length(), 3);
  DCHECK(args[0]->IsUint32());
  DCHECK(args[1]->IsUint32());
  DCHECK(args[2]->IsString());
  uint32_t trace_id = args[0].As<Uint32>()->Value();
  Span::PropType prop_type =
    static_cast<Span::PropType>(args[1].As<Uint32>()->Value());
  std::unique_ptr<SpanPropBase> prop;
  Local<String> value_s = args[2].As<String>();
  if (prop_type == Span::kSpanOtelIds && value_s->IsOneByte()) {
    char ids[67];
    int len = value_s->WriteOneByte(isolate, reinterpret_cast<uint8_t*>(ids));
    ids[len] = '\0';
    prop = Span::createSpanProp<std::string>(prop_type, ids);
  } else {
    String::Utf8Value value_str(isolate, value_s);
    prop = Span::createSpanProp<std::string>(prop_type, *value_str);
  }

  SpanItem item = { trace_id,
                    envinst->thread_id(),
                    std::move(prop) };
  EnvList::Inst()->GetTracer()->pushSpanData(std::move(item));
}


static void GetEnvMetrics(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  EnvInst* envinst = EnvInst::GetEnvLocalInst(isolate);
  CHECK_NE(envinst, nullptr);
  ThreadMetrics* tmetrics = &envinst->tmetrics;
  std::string metrics_string;

  int er = tmetrics->Update(isolate);
  if (er)
    return args.GetReturnValue().Set(er);

  args.GetReturnValue().Set(OneByteString(isolate, tmetrics->toJSON().c_str()));
}


static void GetProcessMetrics(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  EnvInst* envinst = EnvInst::GetEnvLocalInst(isolate);
  CHECK_NE(envinst, nullptr);
  ProcessMetrics* pmetrics = &envinst->pmetrics;

  int er = pmetrics->Update();
  if (er)
    return args.GetReturnValue().Set(er);
  args.GetReturnValue().Set(OneByteString(isolate, pmetrics->toJSON().c_str()));
}


static void ClearFatalError(const FunctionCallbackInfo<Value>& args) {
  EnvList::Inst()->ClearSavedExitError();
}


static void SaveFatalError(const FunctionCallbackInfo<Value>& args) {
  CHECK(args[0]->IsNativeError());
  Isolate* isolate = args.GetIsolate();
  EnvList::Inst()->SetSavedExitError(isolate, args[0]);
}


static void GetProcessInfo(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  Local<Value> parsed;
  if (!JSON::Parse(context,
        OneByteString(isolate,
                      EnvList::Inst()->GetInfo().c_str())).ToLocal(&parsed) ||
      !parsed->IsObject()) {
    return args.GetReturnValue().SetNull();
  }
  args.GetReturnValue().Set(parsed);
}


static void StoreProcessInfo(const FunctionCallbackInfo<Value>& args) {
  CHECK(args[0]->IsString());
  Isolate* isolate = args.GetIsolate();
  Local<String> info_s = args[0].As<String>();
  String::Utf8Value info(isolate, info_s);
  EnvList::Inst()->StoreInfo(std::string(*info));
}


static void UpdateConfig(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();

  CHECK(args[0]->IsString());
  DCHECK(Environment::GetCurrent(isolate)->is_main_thread());

  Local<String> config_s = args[0].As<String>();
  String::Utf8Value config(isolate, config_s);
  EnvList::Inst()->UpdateConfig(std::string(*config));
}


static void close_nsolid_loader(void* ptr) {
  // In case the EnvList command queues are in the middle of processing, prevent
  // the main thread from exiting until all commands have been processed.
  ns_mutex::scoped_lock lock(EnvList::Inst()->command_lock());
}


static void run_nsolid_loader(ns_timer* handle, Environment* env) {
  Isolate* isolate = Isolate::GetCurrent();

  CHECK_EQ(env, Environment::GetCurrent(isolate));

  if (env->can_call_into_js()) {
    HandleScope handle_scope(env->isolate());
    Context::Scope context_scope(env->context());
    env->nsolid_loader_fn()->Call(
        env->context(), env->process_object(), 0, nullptr).ToLocalChecked();
  }

  handle->close_and_delete();
}


static void RecordStartupTime(const FunctionCallbackInfo<Value>& args) {
  // Since this is a user facing API, don't want to abort if the argument type
  // is incorrect. So instead just return early.
  if (!args[0]->IsString())
    return args.GetReturnValue().Set(-1);
  String::Utf8Value name(args.GetIsolate(), args[0].As<String>());
  EnvInst* envinst = EnvInst::GetEnvLocalInst(args.GetIsolate());
  CHECK_NE(envinst, nullptr);
  envinst->SetStartupTime(*name);
}


static void RunStartInTimeout(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Environment* env = Environment::GetCurrent(isolate);

  CHECK(env->is_main_thread());
  if (!env->nsolid_loader_fn().IsEmpty()) {
    return;
  }
  CHECK(args[0]->IsFunction());
  CHECK(args[1]->IsUint32());

  node::AtExit(env, close_nsolid_loader, nullptr);
  ns_timer* loader_timer = new ns_timer();
  CHECK_NOT_NULL(loader_timer);
  int er = loader_timer->init(env->event_loop());
  CHECK_EQ(er, 0);

  env->set_nsolid_loader_fn(args[0].As<Function>());
  uint32_t delay = args[1].As<Uint32>()->Value();

  er = loader_timer->start(run_nsolid_loader, delay, 0, env);
  CHECK_EQ(er, 0);
  loader_timer->unref();
}


static void StoreModuleInfo(const FunctionCallbackInfo<Value>& args) {
  CHECK(args[0]->IsString());
  CHECK(args[1]->IsString());
  Isolate* isolate = args.GetIsolate();
  Local<String> path_s = args[0].As<String>();
  Local<String> module_s = args[1].As<String>();
  String::Utf8Value path(isolate, path_s);
  String::Utf8Value module(isolate, module_s);
  EnvInst* envinst = EnvInst::GetEnvLocalInst(isolate);
  CHECK_NE(envinst, nullptr);
  envinst->SetModuleInfo(*path, *module);
}


static void GetStartupTimes(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  EnvInst* envinst = EnvInst::GetEnvLocalInst(isolate);
  CHECK_NE(envinst, nullptr);
  std::string ms = envinst->GetStartupTimes();
  Local<String> ms_str =
    String::NewFromUtf8(isolate,
                        ms.c_str(),
                        v8::NewStringType::kNormal).ToLocalChecked();
  args.GetReturnValue().Set(ms_str);
}


static void GetConfig(const FunctionCallbackInfo<Value>& args) {
  EnvList* envlist = EnvList::Inst();
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  Local<Value> parsed;
  nlohmann::json config = envlist->current_config();
  if (!JSON::Parse(context,
        OneByteString(isolate,
                      config.dump().c_str())).ToLocal(&parsed) ||
      !parsed->IsObject()) {
    return args.GetReturnValue().SetNull();
  }
  args.GetReturnValue().Set(parsed);
}


static void GetConfigVersion(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(EnvList::Inst()->current_config_version());
}


static void PauseMetrics(const FunctionCallbackInfo<Value>& args) {
  EnvInst* envinst = EnvInst::GetEnvLocalInst(args.GetIsolate());
  CHECK_NE(envinst, nullptr);
  if (!envinst->metrics_paused)
    EnvList::Inst()->UpdateConfig(nlohmann::json({{ "pauseMetrics", true }}));
  envinst->metrics_paused = true;
}


static void ResumeMetrics(const FunctionCallbackInfo<Value>& args) {
  EnvInst* envinst = EnvInst::GetEnvLocalInst(args.GetIsolate());
  CHECK_NE(envinst, nullptr);
  if (envinst->metrics_paused)
    EnvList::Inst()->UpdateConfig(nlohmann::json({{ "pauseMetrics", false }}));
  envinst->metrics_paused = false;
}


static void SetMetricsInterval(const FunctionCallbackInfo<Value>& args) {
  CHECK(args[0]->IsNumber());
  double interval = args[0].As<Number>()->Value();
  gen_ptiles_interval = static_cast<uint64_t>(interval);
}


static void OnCustomCommand(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  CHECK(args[0]->IsFunction());
  CHECK(env->nsolid_on_command_fn().IsEmpty());
  env->set_nsolid_on_command_fn(args[0].As<Function>());
}


static void getThreadName(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  args.GetReturnValue().Set(
    String::NewFromUtf8(
        isolate,
        EnvInst::GetEnvLocalInst(isolate)->GetThreadName().c_str(),
        v8::NewStringType::kNormal).ToLocalChecked());
}


static void setThreadName(const FunctionCallbackInfo<Value>& args) {
  CHECK(args[0]->IsString());
  Isolate* isolate = args.GetIsolate();
  Local<String> name_s = args[0].As<String>();
  String::Utf8Value name(args.GetIsolate(), name_s);
  EnvInst::GetEnvLocalInst(isolate)->SetThreadName(*name);
}


static void SetTimeOrigin(const FunctionCallbackInfo<Value>& args) {
  CHECK(args[0]->IsNumber());
  EnvList::Inst()->SetTimeOrigin(args[0].As<Number>()->Value());
}


static void SetToggleTracingFn(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  CHECK(args[0]->IsFunction());
  CHECK(env->nsolid_toggle_tracing_fn().IsEmpty());
  env->set_nsolid_toggle_tracing_fn(args[0].As<Function>());
}


static void SetTrackPromisesFn(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  CHECK(args[0]->IsFunction());
  if (!env->nsolid_track_promises_fn().IsEmpty()) {
    return;
  }
  env->set_nsolid_track_promises_fn(args[0].As<Function>());
}


static void GetSpanId(const FunctionCallbackInfo<Value>& args) {
  std::string span_id;
  EnvList* envlist = EnvList::Inst();
  envlist->popSpanId(span_id);
  args.GetReturnValue().Set(OneByteString(args.GetIsolate(), span_id.c_str()));
}


static void GetTraceId(const FunctionCallbackInfo<Value>& args) {
  std::string trace_id;
  EnvList* envlist = EnvList::Inst();
  envlist->popTraceId(trace_id);
  args.GetReturnValue().Set(OneByteString(args.GetIsolate(), trace_id.c_str()));
}


static void CustomCommandResponse(const FunctionCallbackInfo<Value>& args) {
  CHECK(args[0]->IsString());
  CHECK(args[1]->IsString());
  CHECK(args[2]->IsBoolean());
  Isolate* isolate = args.GetIsolate();
  EnvInst* envinst = EnvInst::GetEnvLocalInst(isolate);
  Local<String> req_id_s = args[0].As<String>();
  String::Utf8Value req_id(isolate, req_id_s);
  Local<String> value_s = args[1].As<String>();
  String::Utf8Value value(isolate, value_s);
  args.GetReturnValue().Set(
      envinst->CustomCommandResponse(*req_id, *value, args[2]->IsTrue()));
}


static void AttachRequestToCustomCommand(
    const FunctionCallbackInfo<Value>& args) {
  CHECK(args[0]->IsObject());
  CHECK(args[1]->IsString());
  Isolate* isolate = args.GetIsolate();
  Local<String> req_id_s = args[1].As<String>();
  String::Utf8Value req_id(isolate, req_id_s);
  auto* req = new (std::nothrow) EnvInst::CustomCommandGlobalReq({
    *req_id,
    { isolate, args[0].As<Object>() }
  });

  if (req == nullptr) {
    args.GetReturnValue().Set(UV_ENOMEM);
    return;
  }

  req->request.SetWeak(req,
                       EnvInst::CustomCommandReqWeakCallback,
                       WeakCallbackType::kParameter);

  args.GetReturnValue().Set(0);
}


static void GetOnBlockedBody(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  auto body = EnvInst::GetEnvLocalInst(isolate)->GetOnBlockedBody();
  CHECK(!body.empty());
  args.GetReturnValue().Set(
    String::NewFromUtf8(isolate,
                        body.c_str(),
                        v8::NewStringType::kNormal).ToLocalChecked());
}


static void SetupArrayBufferExports(Isolate* isolate,
                                    Local<Object> target,
                                    Local<Context> context,
                                    SharedEnvInst envinst_sp) {
  std::unique_ptr<BackingStore> bs =
    ArrayBuffer::NewBackingStore(envinst_sp->count_fields,
                                 EnvInst::kFieldCount * sizeof(double),
                                 [](void*, size_t, void*){},
                                 nullptr);

  Local<ArrayBuffer> ab = ArrayBuffer::New(isolate, std::move(bs));
  target->Set(context,
              OneByteString(isolate, "nsolid_counts"),
              Float64Array::New(ab, 0, EnvInst::kFieldCount)).Check();

  uint32_t* tf = envinst_sp->get_trace_flags();
  std::unique_ptr<BackingStore> trace_flags_bs =
    ArrayBuffer::NewBackingStore(tf,
                                 sizeof(uint32_t),
                                 [](void*, size_t, void*){},
                                 nullptr);

  Local<ArrayBuffer> trace_flags_ab =
    ArrayBuffer::New(isolate, std::move(trace_flags_bs));
  target->Set(context,
              OneByteString(isolate, "trace_flags"),
              Uint32Array::New(trace_flags_ab, 0, 1)).Check();
}


static void SetupArrayBuffers(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  SetupArrayBufferExports(isolate,
                          args.This(),
                          isolate->GetCurrentContext(),
                          EnvInst::GetCurrent(isolate));
}


BindingData::BindingData(Realm* realm, Local<Object> object)
    : SnapshotableObject(realm, object, type_int) {
}


bool BindingData::PrepareForSerialization(Local<Context> context,
                                          v8::SnapshotCreator* creator) {
  // Return true because we need to maintain the reference to the binding from
  // JS land.
  return true;
}


InternalFieldInfoBase* BindingData::Serialize(int index) {
  DCHECK_EQ(index, BaseObject::kEmbedderType);
  InternalFieldInfo* info =
      InternalFieldInfoBase::New<InternalFieldInfo>(type());
  return info;
}


void BindingData::Deserialize(Local<Context> context,
                              Local<Object> holder,
                              int index,
                              InternalFieldInfoBase* info) {
  DCHECK_EQ(index, BaseObject::kEmbedderType);
  HandleScope scope(context->GetIsolate());
  Realm* realm = Realm::GetCurrent(context);
  BindingData* binding = realm->AddBindingData<BindingData>(context, holder);
  CHECK_NOT_NULL(binding);
}

v8::CFunction BindingData::fast_push_client_bucket_(
    v8::CFunction::Make(FastPushClientBucket));
v8::CFunction BindingData::fast_push_dns_bucket_(
    v8::CFunction::Make(FastPushDnsBucket));
v8::CFunction BindingData::fast_push_server_bucket_(
    v8::CFunction::Make(FastPushServerBucket));
v8::CFunction BindingData::fast_push_span_data_double_(
    v8::CFunction::Make(FastPushSpanDataDouble));
v8::CFunction BindingData::fast_push_span_data_uint64_(
    v8::CFunction::Make(FastPushSpanDataUint64));


void BindingData::Initialize(Local<Object> target,
                             Local<Value> unused,
                             Local<Context> context,
                             void* priv) {
  Environment* env = Environment::GetCurrent(context);
  auto envinst_sp = EnvInst::GetCurrent(context);
  Isolate* isolate = env->isolate();
  Realm* realm = Realm::GetCurrent(context);
  BindingData* const binding_data =
      realm->AddBindingData<BindingData>(context, target);
  if (binding_data == nullptr) return;

  SetFastMethod(context,
                target,
                "pushClientBucket",
                SlowPushClientBucket,
                &fast_push_client_bucket_);
  SetFastMethod(context,
                target,
                "pushDnsBucket",
                SlowPushDnsBucket,
                &fast_push_dns_bucket_);
  SetFastMethod(context,
                target,
                "pushServerBucket",
                SlowPushServerBucket,
                &fast_push_server_bucket_);
  SetFastMethod(context,
                target,
                "pushSpanDataDouble",
                SlowPushSpanDataDouble,
                &fast_push_span_data_double_);
  SetFastMethod(context,
                target,
                "pushSpanDataUint64",
                SlowPushSpanDataUint64,
                &fast_push_span_data_uint64_);

  SetMethod(context, target, "agentId", AgentId);
  SetMethod(context, target, "pushSpanDataString", PushSpanDataString);
  SetMethod(context, target, "getEnvMetrics", GetEnvMetrics);
  SetMethod(context, target, "getProcessMetrics", GetProcessMetrics);
  SetMethod(context, target, "getProcessInfo", GetProcessInfo);
  SetMethod(context, target, "storeProcessInfo", StoreProcessInfo);
  SetMethod(context, target, "saveFatalError", SaveFatalError);
  SetMethod(context, target, "clearFatalError", ClearFatalError);
  SetMethod(context, target, "updateConfig", UpdateConfig);
  SetMethod(context, target, "recordStartupTime", RecordStartupTime);
  SetMethod(context, target, "runStartInTimeout", RunStartInTimeout);
  SetMethod(context, target, "storeModuleInfo", StoreModuleInfo);
  SetMethod(context, target, "getStartupTimes", GetStartupTimes);
  SetMethod(context, target, "getConfig", GetConfig);
  SetMethod(context, target, "getConfigVersion", GetConfigVersion);
  SetMethod(context, target, "pauseMetrics", PauseMetrics);
  SetMethod(context, target, "resumeMetrics", ResumeMetrics);
  SetMethod(context, target, "setMetricsInterval", SetMetricsInterval);
  SetMethod(context, target, "onCustomCommand", OnCustomCommand);
  SetMethod(context, target, "customCommandResponse", CustomCommandResponse);
  SetMethod(context,
            target,
            "attachRequestToCustomCommand",
            AttachRequestToCustomCommand);
  SetMethod(context, target, "getThreadName", getThreadName);
  SetMethod(context, target, "setThreadName", setThreadName);
  SetMethod(context, target, "setTimeOrigin", SetTimeOrigin);
  SetMethod(context, target, "setToggleTracingFn", SetToggleTracingFn);
  SetMethod(context, target, "setTrackPromisesFn", SetTrackPromisesFn);
  SetMethod(context, target, "getSpanId", GetSpanId);
  SetMethod(context, target, "getTraceId", GetTraceId);

  SetMethod(context, target, "_getOnBlockedBody", GetOnBlockedBody);
  SetMethod(context, target, "_setupArrayBuffers", SetupArrayBuffers);

  Local<Object> consts_enum = Object::New(isolate);

#define V(Name)                                                                \
  consts_enum->Set(context,                                                    \
                   OneByteString(isolate, #Name),                              \
                   Integer::New(isolate, EnvInst::Name)).Check();
  NSOLID_JS_METRICS_COUNTERS(V)
#undef V

#define V(Name, Val, Str)                                                      \
  consts_enum->Set(context,                                                    \
                   OneByteString(isolate, #Name),                              \
                   Integer::New(isolate, Tracer::Name)).Check();
  NSOLID_SPAN_TYPES(V)
#undef V

#define V(Name)                                                                \
  consts_enum->Set(context,                                                    \
                   OneByteString(isolate, #Name),                              \
                   Integer::New(isolate, Tracer::Name)).Check();
  NSOLID_SPAN_END_REASONS(V)
#undef V

#define V(Name)                                                                \
  consts_enum->Set(context,                                                    \
                   OneByteString(isolate, #Name),                              \
                   Integer::New(isolate, Span::Name)).Check();
  NSOLID_SPAN_DNS_TYPES(V)
  NSOLID_SPAN_PROP_TYPES_STRINGS(V)
  NSOLID_SPAN_PROP_TYPES_NUMBERS(V)
#undef V

#define V(Enum, Type, CName, JSName)                                           \
  consts_enum->Set(context,                                                    \
                   OneByteString(isolate, #Enum),                              \
                   Integer::New(isolate, Span::Enum)).Check();
  NSOLID_SPAN_ATTRS(V)
#undef V

  consts_enum->Set(context,
                   OneByteString(isolate, "kTraceFieldCount"),
                   Integer::New(isolate, EnvInst::kFieldCount)).Check();
  target->Set(context,
              OneByteString(isolate, "nsolid_consts"),
              consts_enum).Check();

  /*
   * Don't setup the ArrayBuffers (nsolid_counts, trace_flags) in the main
   * thread yet as it's part of the snapshot now, so at this point there's no
   * real backing memory. It'll be setup later on, on initialization @
   * nsolid_loader.
   */
  if (!env->is_main_thread()) {
    SetupArrayBufferExports(isolate, target, context, envinst_sp);
  }

  target->Set(
      context,
      OneByteString(isolate, "nsolid_tracer_s"),
      Symbol::New(
        isolate, OneByteString(isolate, "nsolid_timer_tracer"))).Check();

  target->Set(
      context,
      OneByteString(isolate, "nsolid_span_id_s"),
      Symbol::New(
        isolate, OneByteString(isolate, "nsolid_span_id"))).Check();
}


void BindingData::RegisterExternalReferences(
    ExternalReferenceRegistry* registry) {

  registry->Register(SlowPushClientBucket);
  registry->Register(FastPushClientBucket);
  registry->Register(fast_push_client_bucket_.GetTypeInfo());

  registry->Register(SlowPushDnsBucket);
  registry->Register(FastPushDnsBucket);
  registry->Register(fast_push_dns_bucket_.GetTypeInfo());

  registry->Register(SlowPushServerBucket);
  registry->Register(FastPushServerBucket);
  registry->Register(fast_push_server_bucket_.GetTypeInfo());

  registry->Register(SlowPushSpanDataDouble);
  registry->Register(FastPushSpanDataDouble);
  registry->Register(fast_push_span_data_double_.GetTypeInfo());

  registry->Register(SlowPushSpanDataUint64);
  registry->Register(FastPushSpanDataUint64);
  registry->Register(fast_push_span_data_uint64_.GetTypeInfo());

  registry->Register(AgentId);
  registry->Register(PushSpanDataString);
  registry->Register(GetEnvMetrics);
  registry->Register(GetProcessMetrics);
  registry->Register(GetProcessInfo);
  registry->Register(StoreProcessInfo);
  registry->Register(SaveFatalError);
  registry->Register(ClearFatalError);
  registry->Register(UpdateConfig);
  registry->Register(RecordStartupTime);
  registry->Register(RunStartInTimeout);
  registry->Register(StoreModuleInfo);
  registry->Register(GetStartupTimes);
  registry->Register(GetConfig);
  registry->Register(GetConfigVersion);
  registry->Register(PauseMetrics);
  registry->Register(ResumeMetrics);
  registry->Register(SetMetricsInterval);
  registry->Register(OnCustomCommand);
  registry->Register(CustomCommandResponse);
  registry->Register(AttachRequestToCustomCommand);
  registry->Register(getThreadName);
  registry->Register(setThreadName);
  registry->Register(SetTimeOrigin);
  registry->Register(SetToggleTracingFn);
  registry->Register(SetTrackPromisesFn);
  registry->Register(GetSpanId);
  registry->Register(GetTraceId);
  registry->Register(GetOnBlockedBody);
  registry->Register(SetupArrayBuffers);
}

}  // namespace nsolid
}  // namespace node

NODE_BINDING_CONTEXT_AWARE_INTERNAL(nsolid_api,
                                    node::nsolid::BindingData::Initialize)
NODE_BINDING_EXTERNAL_REFERENCE(
    nsolid_api, node::nsolid::BindingData::RegisterExternalReferences)
