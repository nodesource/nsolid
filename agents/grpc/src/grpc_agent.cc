#include "grpc_agent.h"

#include "asserts-cpp/asserts.h"
#include "debug_utils-inl.h"
#include "nsolid/nsolid_api.h"
#include "nsolid/nsolid_util.h"
#include "../../otlp/src/otlp_common.h"
#include "../../src/span_collector.h"
#include "absl/log/initialize.h"
#include "opentelemetry/sdk/metrics/data/metric_data.h"
#include "opentelemetry/sdk/metrics/export/metric_producer.h"
#include "opentelemetry/exporters/otlp/otlp_grpc_exporter.h"
#include "opentelemetry/exporters/otlp/otlp_grpc_log_record_exporter.h"
#include "opentelemetry/exporters/otlp/otlp_grpc_metric_exporter.h"
#include "opentelemetry/exporters/otlp/otlp_metric_utils.h"
#include "opentelemetry/trace/semantic_conventions.h"

using std::chrono::system_clock;
using std::chrono::time_point;
using json = nlohmann::json;
using ThreadMetricsStor = node::nsolid::ThreadMetrics::MetricsStor;
using opentelemetry::nostd::span;
using LogsRecordable = opentelemetry::sdk::logs::Recordable;
using opentelemetry::sdk::metrics::MetricData;
using opentelemetry::sdk::metrics::ResourceMetrics;
using opentelemetry::sdk::metrics::ScopeMetrics;
using opentelemetry::sdk::resource::Resource;
using opentelemetry::sdk::resource::ResourceAttributes;
using opentelemetry::sdk::trace::Recordable;
using opentelemetry::v1::exporter::otlp::OtlpGrpcClientOptions;
using opentelemetry::v1::exporter::otlp::OtlpGrpcExporter;
using opentelemetry::v1::exporter::otlp::OtlpGrpcExporterOptions;
using opentelemetry::v1::exporter::otlp::OtlpGrpcLogRecordExporter;
using opentelemetry::v1::exporter::otlp::OtlpGrpcLogRecordExporterOptions;
using opentelemetry::v1::exporter::otlp::OtlpGrpcMetricExporter;
using opentelemetry::v1::exporter::otlp::OtlpGrpcMetricExporterOptions;
using opentelemetry::v1::exporter::otlp::OtlpMetricUtils;
using opentelemetry::v1::trace::SemanticConventions::kProcessOwner;

namespace node {
namespace nsolid {
namespace grpc {

using ThreadMetricsMap = std::map<uint64_t, ThreadMetrics::MetricsStor>;

constexpr uint64_t span_timer_interval = 1000;
constexpr size_t span_msg_q_min_size = 1000;

const char* const kNSOLID_GRPC_INSECURE = "NSOLID_GRPC_INSECURE";
const char* const kNSOLID_GRPC_CERTS = "NSOLID_GRPC_CERTS";

const int MAX_AUTH_RETRIES = 20;
const uint64_t auth_timer_interval = 500;

const size_t GRPC_MAX_SIZE = 4L * 1024 * 1024;  // 4GB

static const char* const root_certs[] = {
#include "node_root_certs.h"  // NOLINT(build/include_order)
};

static const char* kErrorProfileInProgress[kNumberOfProfileTypes] = {
  "'cpu_profile' already in progress",
  "'heap_profile' already in progress",
  "'heap_sampling' already in progress",
  "'heap_snapshot' already in progress"
};

template <typename... Args>
inline void Debug(Args&&... args) {
  per_process::Debug(DebugCategory::NSOLID_GRPC_AGENT,
                     std::forward<Args>(args)...);
}


inline void DebugJSON(const char* str, const json& msg) {
  if (UNLIKELY(per_process::enabled_debug_list.enabled(
        DebugCategory::NSOLID_GRPC_AGENT))) {
    Debug(str, msg.dump(4).c_str());
  }
}

JSThreadMetrics::JSThreadMetrics(SharedEnvInst envinst):
    metrics_(ThreadMetrics::Create(envinst)) {
}

std::pair<int64_t, int64_t>
create_recorded(const time_point<system_clock>& ts) {
  using std::chrono::duration_cast;
  using std::chrono::seconds;
  using std::chrono::nanoseconds;

  system_clock::duration dur = ts.time_since_epoch();
  return { duration_cast<seconds>(dur).count(),
           duration_cast<nanoseconds>(dur % seconds(1)).count() };
}

ErrorStor fill_error_stor(const ErrorType& type) {
  if (type == ErrorType::ESuccess) {
    return {0, "Success"};
  }
#define X(t, code, str, runtime_code)                                \
  if (type == ErrorType::t) {                                        \
    return {code, str "(" #runtime_code ")"};                        \
  }
GRPC_ERRORS(X)
#undef X
  return {500, "Internal Runtime Error"};
}

ErrorType translate_error(int err) {
  switch (err) {
    case 0:
      return ErrorType::ESuccess;
    case UV_EBADF:
    case UV_ESRCH:
      return ErrorType::EThreadGoneError;
    case UV_EEXIST:
      return ErrorType::EInProgressError;
    case UV_ENOENT:
      return ErrorType::ENotAvailable;
    case UV_ENOMEM:
      return ErrorType::ENoMemory;
    default:
      return ErrorType::EUnknown;
  }
}

void PopulateCommon(grpcagent::CommonResponse* common,
                    const std::string& command,
                    const char* req_id) {
  common->set_command(command);
  auto recorded = create_recorded(system_clock::now());
  grpcagent::Time* time = common->mutable_recorded();
  time->set_seconds(recorded.first);
  time->set_nanoseconds(recorded.second);
  if (req_id) {
    common->set_requestid(req_id);
  }
}

void PopulateError(grpcagent::CommonResponse* common,
                   const ErrorType& type) {
  auto error_info = common->mutable_error();
  auto error = fill_error_stor(type);
  error_info->set_code(error.code);
  error_info->set_message(error.message);
}

void PopulateBlockedLoopEvent(grpcagent::BlockedLoopEvent* blocked_loop_event,
                              const GrpcAgent::BlockedLoopStor& stor) {
  // Fill in the fields of the BlockedLoopEvent.
  nlohmann::json body = json::parse(stor.body, nullptr, false);
  ASSERT(!body.is_discarded());

  PopulateCommon(blocked_loop_event->mutable_common(), "loop_blocked", nullptr);

  grpcagent::BlockedLoopBody* blocked_body = blocked_loop_event->mutable_body();
  blocked_body->set_thread_id(stor.thread_id);
  blocked_body->set_blocked_for(body["blocked_for"].get<int32_t>());
  blocked_body->set_loop_id(body["loop_id"].get<int32_t>());
  blocked_body->set_callback_cntr(body["callback_cntr"].get<int32_t>());

  for (const auto& stack : body["stack"]) {
    grpcagent::Stack* proto_stack = blocked_body->add_stack();
    proto_stack->set_is_eval(stack["is_eval"].get<bool>());
    auto it = stack.find("script_name");
    if (it != stack.end() && it->is_string()) {
      proto_stack->set_script_name(*it);
    }

    it = stack.find("function_name");
    if (it != stack.end() && it->is_string()) {
      proto_stack->set_function_name(*it);
    }

    proto_stack->set_line_number(stack["line_number"].get<int32_t>());
    proto_stack->set_column(stack["column"].get<int32_t>());
  }
}

void PopulateInfoEvent(grpcagent::InfoEvent* info_event,
                       const nlohmann::json& info,
                       const char* req_id) {
  DebugJSON("Process Info: \n%s\n", info);

  // Fill in the fields of the InfoResponse.
  PopulateCommon(info_event->mutable_common(), "info", req_id);

  grpcagent::InfoBody* body = info_event->mutable_body();
  if (!info.is_null()) {
    if (info.find("app") != info.end()) {
      body->set_app(info["app"].get<std::string>());
    }
    if (info.find("arch") != info.end()) {
      body->set_arch(info["arch"].get<std::string>());
    }
    if (info.find("cpuCores") != info.end()) {
      body->set_cpucores(info["cpuCores"].get<uint32_t>());
    }
    if (info.find("cpuModel") != info.end()) {
      body->set_cpumodel(info["cpuModel"].get<std::string>());
    }
    if (info.find("execPath") != info.end()) {
      body->set_execpath(info["execPath"].get<std::string>());
    }
    if (info.find("hostname") != info.end()) {
      body->set_hostname(info["hostname"].get<std::string>());
    }
    if (info.find("id") != info.end()) {
      body->set_id(info["id"].get<std::string>());
    }
    if (info.find("main") != info.end()) {
      body->set_main(info["main"].get<std::string>());
    }
    if (info.find("nodeEnv") != info.end()) {
      body->set_nodeenv(info["nodeEnv"].get<std::string>());
    }
    if (info.find("pid") != info.end()) {
      body->set_pid(info["pid"].get<uint32_t>());
    }
    if (info.find("platform") != info.end()) {
      body->set_platform(info["platform"].get<std::string>());
    }
    if (info.find("processStart") != info.end()) {
      body->set_processstart(info["processStart"].get<uint64_t>());
    }
    if (info.find("totalMem") != info.end()) {
      body->set_totalmem(info["totalMem"].get<uint64_t>());
    }
    // add tags
    if (info.find("tags") != info.end()) {
      for (const auto& tag : info["tags"]) {
        body->add_tags(tag.get<std::string>());
      }
    }

    // add versions
    if (info.find("versions") != info.end()) {
      for (const auto& [key, value] : info["versions"].items()) {
        (*body->mutable_versions())[key] = value.get<std::string>();
      }
    }
  }
}

void PopulateMetricsEvent(grpcagent::MetricsEvent* metrics_event,
                          const ProcessMetrics::MetricsStor& proc_metrics,
                          const ThreadMetricsMap& env_metrics,
                          const char* req_id) {
  // Fill in the fields of the MetricsResponse.
  PopulateCommon(metrics_event->mutable_common(), "metrics", req_id);

  ResourceMetrics data;
  data.resource_ = otlp::GetResource();
  std::vector<MetricData> metrics;

  // As this is the cached we're sending, we pass the same value for prev_stor.
  otlp::fill_proc_metrics(metrics, proc_metrics, proc_metrics, false);
  for (const auto& [env_id, env_metrics_stor] : env_metrics) {
    otlp::fill_env_metrics(metrics, env_metrics_stor, false);
  }

  data.scope_metric_data_ =
    std::vector<ScopeMetrics>{{otlp::GetScope(), metrics}};
  OtlpMetricUtils::PopulateResourceMetrics(
    data, metrics_event->mutable_body()->mutable_resource_metrics()->Add());
}

void PopulatePackagesEvent(grpcagent::PackagesEvent* packages_event,
                           const char* req_id) {
  std::string packs;
  int err;

  err = ModuleInfo(GetMainEnvInst(), &packs);
  if (err != 0) {
    Debug("Error getting module info: %d\n", err);
    return;
  }

  nlohmann::json packages = json::parse(packs, nullptr, false);
  if (packages.is_discarded()) {
    Debug("Error parsing packages info\n");
    return;
  }

  DebugJSON("Packages Info: \n%s\n", packages);

  // Fill in the fields of the InfoResponse.
  PopulateCommon(packages_event->mutable_common(), "packages", req_id);

  grpcagent::PackagesBody* body = packages_event->mutable_body();
  for (const auto& package : packages) {
    grpcagent::Package* proto_package = body->add_packages();
    if (package.contains("path")) {
      proto_package->set_path(package["path"].get<std::string>());
    }
    if (package.contains("name")) {
      proto_package->set_name(package["name"].get<std::string>());
    }
    if (package.contains("version")) {
      proto_package->set_version(package["version"].get<std::string>());
    }
    if (package.contains("main") && package["main"].is_string()) {
      proto_package->set_main(package["main"].get<std::string>());
    }

    if (package.contains("dependencies") &&
        package["dependencies"].is_array()) {
      for (const auto& dep : package["dependencies"]) {
        proto_package->add_dependencies(dep.get<std::string>());
      }
    }

    if (package.contains("required")) {
      proto_package->set_required(package["required"].get<bool>());
    }
  }
}

void PopulateReconfigureEvent(grpcagent::ReconfigureEvent* reconfigure_event,
                              const char* req_id) {
  // Fill in the fields of the BlockedLoopEvent.
  nlohmann::json config = json::parse(GetConfig(), nullptr, false);
  ASSERT(!config.is_discarded());

  PopulateCommon(reconfigure_event->mutable_common(), "reconfigure", req_id);

  grpcagent::ReconfigureBody* body = reconfigure_event->mutable_body();
  auto it = config.find("blockedLoopThreshold");
  if (it != config.end()) {
    body->set_blockedloopthreshold(*it);
  }
  it = config.find("interval");
  if (it != config.end()) {
    body->set_interval(*it);
  }
  it = config.find("pauseMetrics");
  if (it != config.end()) {
    body->set_pausemetrics(*it);
  }
  it = config.find("promiseTracking");
  if (it != config.end()) {
    body->set_promisetracking(*it);
  }
  it = config.find("redactSnapshots");
  if (it != config.end()) {
    body->set_redactsnapshots(*it);
  }
  it = config.find("statsd");
  if (it != config.end()) {
    body->set_statsd(*it);
  }
  it = config.find("statsdBucket");
  if (it != config.end()) {
    body->set_statsdbucket(*it);
  }
  it = config.find("statsdtags");
  if (it != config.end()) {
    body->set_blockedloopthreshold(*it);
  }
  it = config.find("tags");
  if (it != config.end()) {
    for (const auto& tag : *it) {
      body->add_tags(tag.get<std::string>());
    }
  }
  it = config.find("tracingEnabled");
  if (it != config.end()) {
    body->set_tracingenabled(*it);
  }
  it = config.find("tracingModulesBlacklist");
  if (it != config.end()) {
    body->set_tracingmodulesblacklist(*it);
  }
}

void PopulateStartupTimesEvent(grpcagent::StartupTimesEvent* st_events,
                               const char* req_id) {
  PopulateCommon(st_events->mutable_common(), "startup_times", req_id);
  auto envinst = GetMainEnvInst();
  if (envinst == nullptr) {
    // We should be sending back an error here.
    return;
  }
  std::map<std::string, uint64_t> times = envinst->GetStartupTimes();
  for (const auto& [key, value] : times) {
    (*st_events->mutable_body())[key] = value;
  }
}

void PopulateUnblockedLoopEvent(grpcagent::UnblockedLoopEvent* bl_event,
                                const GrpcAgent::BlockedLoopStor& stor) {
  // Fill in the fields of the BlockedLoopEvent.
  nlohmann::json body = json::parse(stor.body, nullptr, false);
  ASSERT(!body.is_discarded());

  PopulateCommon(bl_event->mutable_common(), "loop_unblocked", nullptr);

  grpcagent::UnblockedLoopBody* blocked_body = bl_event->mutable_body();
  blocked_body->set_thread_id(stor.thread_id);
  blocked_body->set_blocked_for(body["blocked_for"].get<int32_t>());
  blocked_body->set_loop_id(body["loop_id"].get<int32_t>());
  blocked_body->set_callback_cntr(body["callback_cntr"].get<int32_t>());
}

/*static*/ SharedGrpcAgent GrpcAgent::Inst() {
  static SharedGrpcAgent agent(new GrpcAgent(), [](GrpcAgent* agent) {
    delete agent;
  });
  return agent;
}

GrpcAgent::GrpcAgent(): hooks_init_(false),
                        ready_(false),
                        exiting_(false),
                        trace_flags_(0),
                        proc_metrics_(),
                        proc_prev_stor_(),
                        config_(json::object()),
                        agent_id_(GetAgentId()),
                        auth_retries_(0),
                        unauthorized_(false),
                        profile_on_exit_(false) {
  ASSERT_EQ(0, uv_loop_init(&loop_));
  ASSERT_EQ(0, uv_cond_init(&start_cond_));
  ASSERT_EQ(0, uv_mutex_init(&start_lock_));
  ASSERT_EQ(0, uv_cond_init(&stop_cond_));
  ASSERT_EQ(0, uv_mutex_init(&stop_lock_));
  ASSERT_EQ(0, profile_state_lock_.init(true));
  absl::InitializeLog();
  // gpr_set_log_function([](gpr_log_func_args* args) {
  //   Debug("gRPC: %s\n", args->message);
  // });

  std::string cert_path;
  if (per_process::system_environment->Get(kNSOLID_GRPC_CERTS).To(&cert_path)) {
    Debug("Using certs from: %s\n", cert_path.c_str());
    int r = ReadFileSync(&custom_certs_, cert_path.c_str());
    if (r != 0) {
      Debug("Error reading certs from: %s. Error: %d.\n", cert_path.c_str(), r);
    }
  }

  if (custom_certs_.empty()) {
    Debug("Using default certs\n");
    for (size_t i = 0; i < sizeof(root_certs) / sizeof(root_certs[0]); i++) {
      cacert_ += root_certs[i];
      cacert_ += "\n";
    }
  }
}

GrpcAgent::~GrpcAgent() {
  uv_mutex_destroy(&stop_lock_);
  uv_cond_destroy(&stop_cond_);
  uv_mutex_destroy(&start_lock_);
  uv_cond_destroy(&start_cond_);
  ASSERT_EQ(0, uv_loop_close(&loop_));
}

void GrpcAgent::got_command_request(grpcagent::CommandRequest&& request) {
  if (command_q_.enqueue(CommandRequestStor{std::move(request)}) == 1) {
    ASSERT_EQ(0, command_msg_.send());
  }
}

void GrpcAgent::reset_command_stream() {
  Debug("Resetting command stream\n");
  command_stream_ = std::make_unique<CommandStream>(nsolid_service_stub_.get(),
                                                    shared_from_this());
}

void GrpcAgent::set_asset_cb(SharedEnvInst envinst,
                             const v8::Local<v8::Function>& cb) {
  asset_cb_map_.emplace(std::piecewise_construct,
                        std::forward_as_tuple(envinst),
                        std::forward_as_tuple(envinst->isolate(), cb));
}

// FIXME(santigimeno): this should be executed in the agent thread!
void GrpcAgent::command_stream_closed(const ::grpc::Status& status) {
  const ::grpc::StatusCode code = status.error_code();
  if (code == ::grpc::StatusCode::UNAUTHENTICATED) {
    Debug("Error Authenticating. Retrying in %ld ms\n", auth_timer_interval);
    auth_retries_++;
    if (auth_retries_ == MAX_AUTH_RETRIES) {
      fprintf(stderr,
              "N|Solid warning: %s Unable to authenticate, "
              "please verify your token and network connection!\n",
              agent_id_.c_str());
      unauthorized_ = true;
      QueueCallback([](WeakGrpcAgent agent_wp) {
        SharedGrpcAgent agent = agent_wp.lock();
        if (agent == nullptr) {
          return;
        }

        agent->stop();
        delete agent.get();
      }, weak_from_this());
      return;
    }
  } else if (code == ::grpc::StatusCode::UNAVAILABLE) {
    Debug("Service unavailable. Retrying in %ld ms\n", auth_timer_interval);
  } else {
    reset_command_stream();
    return;
  }

  ASSERT_EQ(0, auth_timer_.start(+[](nsuv::ns_timer*, WeakGrpcAgent agent_wp) {
    SharedGrpcAgent agent = agent_wp.lock();
    if (agent == nullptr) {
      return;
    }

    agent->reset_command_stream();
  }, auth_timer_interval, 0, weak_from_this()));
}

int GrpcAgent::start() {
  int r = 0;
  if (ready_ == false) {
    uv_mutex_lock(&start_lock_);
    r = thread_.create(run_, weak_from_this());
    if (r == 0) {
      while (ready_ == false) {
        uv_cond_wait(&start_cond_, &start_lock_);
      }
    }

    uv_mutex_unlock(&start_lock_);
  }

  return r;
}

int GrpcAgent::stop(bool profile_stopped) {
  Debug("Stopping gRPC Agent: %d\n", profile_stopped);
  bool expected = false;
  if (exiting_.compare_exchange_strong(expected, true) == false) {
    // Return as it's already exiting. This should never happen, but just in
    // case.
    return 0;
  }

  if (utils::are_threads_equal(thread_.base(), uv_thread_self())) {
    do_stop();
  } else {
    Debug("Stopping gRPC Agent(2): %d\n", profile_stopped);
    if (profile_stopped) {
      profile_on_exit_ = profile_stopped;
      // Wait here until the are no remaining profiles to be completed
      uv_mutex_lock(&stop_lock_);
      do {
        uv_cond_wait(&stop_cond_, &stop_lock_);
      } while (pending_profiles());

      uv_mutex_unlock(&stop_lock_);
    }

    ASSERT_EQ(0, shutdown_.send());
    ASSERT_EQ(0, thread_.join());
  }

  Debug("Stopped gRPC Agent\n");
  return 0;
}

int GrpcAgent::start_cpu_profile(const grpcagent::CommandRequest& req) {
  ProfileOptions options = CPUProfileOptions();
  ErrorType ret = do_start_prof_init(req, ProfileType::kCpu, options);
  ErrorType error = do_start_prof_end(ret, req.requestid(), ProfileType::kCpu, std::move(options));
  return fill_error_stor(error).code;
}

int GrpcAgent::start_cpu_profile_from_js(const grpcagent::CommandRequest& req) {
  ProfileOptions options = CPUProfileOptions();
  ErrorType ret = do_start_prof_init(req, ProfileType::kCpu, options);
  if (ret == ErrorType::ESuccess) {
    std::string req_id = utils::generate_unique_id();
    start_profiling_msg_q_.enqueue({
      ret,
      std::move(req_id),
      ProfileType::kCpu,
      std::move(options)
    });
    ASSERT_EQ(0, start_profiling_msg_.send());
  }

  return fill_error_stor(ret).code;
}

int GrpcAgent::start_heap_profile(const grpcagent::CommandRequest& req) {
  ProfileOptions options = HeapProfileOptions();
  ErrorType ret = do_start_prof_init(req, ProfileType::kHeapProf, options);
  ErrorType error = do_start_prof_end(ret, req.requestid(), ProfileType::kHeapProf, std::move(options));
  return fill_error_stor(error).code;
}

int GrpcAgent::start_heap_profile_from_js(const grpcagent::CommandRequest& req) {
  ProfileOptions options = HeapProfileOptions();
  ErrorType ret = do_start_prof_init(req, ProfileType::kHeapProf, options);
  if (ret == ErrorType::ESuccess) {
    start_profiling_msg_q_.enqueue({
      ret,
      utils::generate_unique_id(),
      ProfileType::kHeapProf,
      std::move(options)
    });
    ASSERT_EQ(0, start_profiling_msg_.send());
  }

  return fill_error_stor(ret).code;
}

int GrpcAgent::start_heap_sampling(const grpcagent::CommandRequest& req) {
  ProfileOptions options = HeapSamplingOptions();
  ErrorType ret = do_start_prof_init(req, ProfileType::kHeapSampl, options);
  ErrorType error = do_start_prof_end(ret, req.requestid(), ProfileType::kHeapSampl, std::move(options));
  return fill_error_stor(error).code;
}

int GrpcAgent::start_heap_sampling_from_js(const grpcagent::CommandRequest& req) {
  ProfileOptions options = HeapSamplingOptions();
  ErrorType ret = do_start_prof_init(req, ProfileType::kHeapSampl, options);
  if (ret == ErrorType::ESuccess) {
    start_profiling_msg_q_.enqueue({
      ret,
      utils::generate_unique_id(),
      ProfileType::kHeapSampl,
      std::move(options)
    });
    ASSERT_EQ(0, start_profiling_msg_.send());
  }

  return fill_error_stor(ret).code;
}

int GrpcAgent::start_heap_snapshot(const grpcagent::CommandRequest& req) {
  ProfileOptions options = HeapSnapshotOptions();
  ErrorType ret = do_start_prof_init(req, ProfileType::kHeapSnapshot, options);
  ErrorType error = do_start_prof_end(ret, req.requestid(), ProfileType::kHeapSnapshot, std::move(options));
  return fill_error_stor(error).code;
}

int GrpcAgent::start_heap_snapshot_from_js(const grpcagent::CommandRequest& req) {
  ProfileOptions options = HeapSnapshotOptions();
  ErrorType ret = do_start_prof_init(req, ProfileType::kHeapSnapshot, options);
  if (ret == ErrorType::ESuccess) {
    start_profiling_msg_q_.enqueue({
      ret,
      utils::generate_unique_id(),
      ProfileType::kHeapSnapshot,
      std::move(options)
    });
    ASSERT_EQ(0, start_profiling_msg_.send());
  }

  return fill_error_stor(ret).code;
}

/*static*/ void GrpcAgent::run_(nsuv::ns_thread*,
                                      WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  agent->do_start();
  do {
    ASSERT_EQ(0, uv_run(&agent->loop_, UV_RUN_DEFAULT));
  } while (uv_loop_alive(&agent->loop_));
}

/*static*/ void GrpcAgent::asset_done_msg_cb_(nsuv::ns_async*,
                                              WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  agent->got_asset_done_msg();
}

/*static*/ void GrpcAgent::at_exit_cb_(bool on_signal,
                                       bool profile_stopped,
                                       WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  agent->stop(profile_stopped);
}

/*static*/ void GrpcAgent::blocked_loop_msg_cb_(nsuv::ns_async*,
                                                WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  agent->got_blocked_loop_msgs();
}

/*static*/ void GrpcAgent::shutdown_cb_(nsuv::ns_async*,
                                        WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  agent->do_stop();
}

/*static*/ void GrpcAgent::command_msg_cb_(nsuv::ns_async*,
                                           WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  CommandRequestStor request;
  while (agent->command_q_.dequeue(request)) {
    agent->handle_command_request(std::move(request));
  }
}

/*static*/ void GrpcAgent::command_stream_done_msg_cb_(nsuv::ns_async*,
                                                       WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  ::grpc::Status status;
  while (agent->command_stream_done_q_.dequeue(status)) {
    agent->command_stream_closed(status);
  }
}

/*static*/ void GrpcAgent::config_agent_cb_(std::string config,
                                            WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  json cfg = json::parse(config, nullptr, false);
  // assert because the runtime should never send me an invalid JSON config
  ASSERT(!cfg.is_discarded());
  if (agent->config_msg_q_.enqueue(cfg) == 1) {
    ASSERT_EQ(0, agent->config_msg_.send());
  }
}

/*static*/ void GrpcAgent::config_msg_cb_(nsuv::ns_async*,
                                          WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  int r = 0;
  json config_msg;

  while (agent->config_msg_q_.dequeue(config_msg)) {
    r = agent->config(config_msg);
  }

  if (r != 0) {
    agent->do_stop();
  }
}

void GrpcAgent::env_creation_cb_(SharedEnvInst envinst,
                                 WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  if (agent->env_msg_q_.enqueue({ envinst, true }) == 1) {
    ASSERT_EQ(0, agent->env_msg_.send());
  }
}

void GrpcAgent::env_deletion_cb_(SharedEnvInst envinst,
                                 WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  agent->env_msg_q_.enqueue({ envinst, false });
  if (!agent->env_msg_.is_closing()) {
    ASSERT_EQ(0, agent->env_msg_.send());
  }
}

/*static*/ void GrpcAgent::env_msg_cb_(nsuv::ns_async*,
                                      WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  std::tuple<SharedEnvInst, bool> tup;
  while (agent->env_msg_q_.dequeue(tup)) {
    SharedEnvInst envinst = std::get<0>(tup);
    EnvInst::Scope scp(envinst);
    if (scp.Success()) {
      bool creation = std::get<1>(tup);
      if (creation) {
        auto pair = agent->env_metrics_map_.emplace(
          std::piecewise_construct,
          std::forward_as_tuple(GetThreadId(envinst)),
          std::forward_as_tuple(envinst));
        ASSERT(pair.second);
      } else {
        agent->env_metrics_map_.erase(GetThreadId(envinst));
      }
    }
  }

}

/*static*/void GrpcAgent::log_cb_(SharedEnvInst envinst,
                                  LogWriteInfo info,
                                  WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  if (agent->log_msg_q_.enqueue({ GetThreadId(envinst), std::move(info) }) == 1) {
    ASSERT_EQ(0, agent->log_msg_.send());
  }
}

/*static*/void GrpcAgent::log_msg_cb_(nsuv::ns_async*,
                                      WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  agent->got_logs();
}

/*static*/void GrpcAgent::loop_blocked_(SharedEnvInst envinst,
                                        std::string body,
                                        WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  if (agent->blocked_loop_msg_q_.enqueue({ true, body, GetThreadId(envinst) }) == 1) {
    ASSERT_EQ(0, agent->blocked_loop_msg_.send());
  }
}

/*static*/void GrpcAgent::loop_unblocked_(SharedEnvInst envinst,
                                          std::string body,
                                          WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  if (agent->blocked_loop_msg_q_.enqueue({ false, body, GetThreadId(envinst) }) == 1) {
    ASSERT_EQ(0, agent->blocked_loop_msg_.send());
  }
}

/*static*/void GrpcAgent::metrics_msg_cb_(nsuv::ns_async*, WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  ResourceMetrics data;
  data.resource_ = otlp::GetResource();
  std::vector<MetricData> metrics;

  ThreadMetricsStor stor;
  while (agent->thr_metrics_msg_q_.dequeue(stor)) {
    otlp::fill_env_metrics(metrics, stor, false);
    agent->thr_metrics_cache_.insert_or_assign(stor.thread_id, std::move(stor));
  }

  data.scope_metric_data_ =
    std::vector<ScopeMetrics>{{otlp::GetScope(), metrics}};
  auto result = agent->metrics_exporter_->Export(data);
  Debug("# ThreadMetrics Exported. Result: %d\n", static_cast<int>(result));
}

/*static*/void GrpcAgent::metrics_timer_cb_(nsuv::ns_timer*, WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  agent->got_proc_metrics();
  for (auto& item : agent->env_metrics_map_) {
    // Retrieve metrics from the Metrics API. Ignore any return error since
    // there's nothing to be done.
    item.second.metrics_->Update(thr_metrics_cb_, agent_wp);
  }
}



/*static*/void GrpcAgent::start_profiling_msg_cb(nsuv::ns_async*,
                                                 WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  StartProfStor stor;
  while (agent->start_profiling_msg_q_.dequeue(stor)) {
    agent->do_start_prof_end(stor.err,
                             stor.req_id,
                             stor.type,
                             std::move(stor.options));
  }
}

/*static*/void GrpcAgent::thr_metrics_cb_(SharedThreadMetrics metrics,
                                          WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  if (agent->thr_metrics_msg_q_.enqueue(metrics->Get()) == 1) {
    ASSERT_EQ(0, uv_async_send(&agent->metrics_msg_));
  }
}

static string_vector tracing_fields({ "/tracingEnabled",
                                      "/tracingModulesBlacklist" });


void GrpcAgent::on_asset_stream_done(AssetStream::AssetStor&& stor) {
  asset_done_q_.enqueue(std::move(stor));
  ASSERT_EQ(0, asset_done_msg_.send());
}

void GrpcAgent::on_command_stream_done(const ::grpc::Status& status) {
  command_stream_done_q_.enqueue(status);
  ASSERT_EQ(0, command_stream_done_msg_.send());
}

void GrpcAgent::check_exit_on_profile() {
  if (exiting_ && pending_profiles() == false) {
    uv_mutex_lock(&stop_lock_);
    uv_cond_signal(&stop_cond_);
    uv_mutex_unlock(&stop_lock_);
  }
}

int GrpcAgent::config(const json& config) {
  int ret = 0;
  json old_config = config_;
  config_ = config;
  json diff = json::diff(old_config, config_);
  DebugJSON("Old Config: \n%s\n", old_config);
  DebugJSON("NewConfig: \n%s\n", config_);
  DebugJSON("Diff: \n%s\n", diff);

  if (utils::find_any_fields_in_diff(diff, { "/saas" })) {
    auto it = config_.find("saas");
    if (it != config_.end()) {
      parse_saas_token(*it);
    } else {
      saas_.clear();
      console_id_.clear();
    }
  }

  if (utils::find_any_fields_in_diff(diff, { "/grpc" })) {
    auto it = config_.find("grpc");
    if (it != config_.end()) {
      // Setup the client/s

      bool insecure = false;
      std::string insecure_str;
      // Only parse the insecure flag in non SaaS mode.
      if (saas_.empty() &&
          per_process::system_environment->Get(kNSOLID_GRPC_INSECURE).To(&insecure_str)) {
        // insecure = std::stoull(insecure_str);
        insecure = std::stoi(insecure_str);
      }

      const std::string endpoint = console_id_.empty() ? it->get<std::string>() : console_id_ + ".grpc.nodesource.io:443";
      Debug("GrpcAgent configured. Endpoint: %s. Insecure: %d\n", endpoint.c_str(), static_cast<unsigned>(insecure));
      client_ = std::make_shared<GrpcClient>();
      {
        OtlpGrpcExporterOptions options;
        options.endpoint = endpoint;
        options.metadata = {{"nsolid-agent-id", agent_id_},
                            {"nsolid-saas", saas_}};
        if (!insecure) {
          options.use_ssl_credentials = true;
          if (!custom_certs_.empty()) {
            options.ssl_credentials_cacert_as_string = custom_certs_;
          } else {
            options.ssl_credentials_cacert_as_string = cacert_;
          }
        }

        trace_exporter_ = std::make_unique<OtlpGrpcExporter>(options);
      }
      {
        OtlpGrpcMetricExporterOptions options;
        options.endpoint = endpoint;
        options.metadata = {{"nsolid-agent-id", agent_id_},
                            {"nsolid-saas", saas_}};
        if (!insecure) {
          options.use_ssl_credentials = true;
          if (!custom_certs_.empty()) {
            options.ssl_credentials_cacert_as_string = custom_certs_;
          } else {
            options.ssl_credentials_cacert_as_string = cacert_;
          }
        }

        metrics_exporter_ = std::make_unique<OtlpGrpcMetricExporter>(options);
      }
      {
        OtlpGrpcLogRecordExporterOptions options;
        options.endpoint = endpoint;
        options.metadata = {{"nsolid-agent-id", agent_id_},
                            {"nsolid-saas", saas_}};
        if (!insecure) {
          options.use_ssl_credentials = true;
          if (!custom_certs_.empty()) {
            options.ssl_credentials_cacert_as_string = custom_certs_;
          } else {
            options.ssl_credentials_cacert_as_string = cacert_;
          }
        }

        log_exporter_ = std::make_unique<OtlpGrpcLogRecordExporter>(options);
      }
      {
        OtlpGrpcClientOptions options;
        options.endpoint = endpoint;
        options.metadata = {{"nsolid-agent-id", agent_id_},
                            {"nsolid-saas", saas_}};
        if (!insecure) {
          options.use_ssl_credentials = true;
          if (!custom_certs_.empty()) {
            options.ssl_credentials_cacert_as_string = custom_certs_;
          } else {
            options.ssl_credentials_cacert_as_string = cacert_;
          }
        }

        nsolid_service_stub_ = GrpcClient::MakeNSolidServiceStub(options);
      }
      reset_command_stream();
    }
  }

  if (utils::find_any_fields_in_diff(diff, { "/blockedLoopThreshold" })) {
    setup_blocked_loop_hooks();
  }
  
  // Configure tracing flags
  if (trace_flags_ == 0 ||
      utils::find_any_fields_in_diff(diff, tracing_fields)) {
    trace_flags_ = 0;
    if (trace_exporter_ != nullptr) {
      auto it = config_.find("tracingEnabled");
      if (it != config_.end()) {
        bool tracing_enabled = *it;
        if (tracing_enabled) {
          trace_flags_ = Tracer::kSpanDns |
                         Tracer::kSpanHttpClient |
                         Tracer::kSpanHttpServer |
                         Tracer::kSpanCustom;
          it = config_.find("tracingModulesBlacklist");
          if (it != config_.end()) {
            const uint32_t blacklisted = *it;
            trace_flags_ &= ~blacklisted;
          }
        }
      }
    }

    update_tracer(trace_flags_);
  }

  // If metrics timer is not active or if the diff contains metrics fields,
  // recalculate the metrics status. (stop/start/what period)
  if (!metrics_timer_.is_active() ||
      utils::find_any_fields_in_diff(diff, { "/interval", "/pauseMetrics" })) {
    uint64_t period = 0;
    auto it = config_.find("pauseMetrics");
    if (it != config_.end()) {
      bool pause = *it;
      if (!pause) {
        it = config_.find("interval");
        if (it != config_.end()) {
          period = *it;
        }
      }
    }

    ret = setup_metrics_timer(period);
  }

    // uint64_t period = NSOLID_SPANS_FLUSH_INTERVAL;
    // std::string spans_flush_interval;
    // if (per_process::system_environment->Get(kNSOLID_SPANS_FLUSH_INTERVAL).To(&spans_flush_interval)) {
    //   period = std::stoull(spans_flush_interval);
    // }

  return ret;
}

void GrpcAgent::do_start() {
  uv_mutex_lock(&start_lock_);

  ASSERT_EQ(0, shutdown_.init(&loop_, shutdown_cb_, weak_from_this()));

  ASSERT_EQ(0, env_msg_.init(&loop_, env_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, asset_done_msg_.init(&loop_, asset_done_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, blocked_loop_msg_.init(&loop_, blocked_loop_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, config_msg_.init(&loop_, config_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, command_msg_.init(&loop_, command_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, command_stream_done_msg_.init(&loop_, command_stream_done_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, auth_timer_.init(&loop_));

  ASSERT_EQ(0, log_msg_.init(&loop_, log_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, metrics_msg_.init(&loop_, metrics_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, metrics_timer_.init(&loop_));

  ASSERT_EQ(0, start_profiling_msg_.init(&loop_, start_profiling_msg_cb, weak_from_this()));

  profile_collector_ = std::make_shared<ProfileCollector>(
    &loop_,
    +[](ProfileCollector::ProfileQStor&& stor, WeakGrpcAgent agent_wp) {
      SharedGrpcAgent agent = agent_wp.lock();
      if (agent == nullptr) {
        return;
      }

      agent->got_profile(std::move(stor));
    },
    weak_from_this());
  profile_collector_->initialize();

  ready_ = true;

  if (hooks_init_ == false) {
    ASSERT_EQ(0, AtExitHook(at_exit_cb_, weak_from_this()));
    ASSERT_EQ(0, OnConfigurationHook(config_agent_cb_, weak_from_this()));
    ASSERT_EQ(0, OnLogWriteHook(log_cb_, weak_from_this()));
    ASSERT_EQ(0, ThreadAddedHook(env_creation_cb_, weak_from_this()));
    ASSERT_EQ(0, ThreadRemovedHook(env_deletion_cb_, weak_from_this()));
    hooks_init_ = true;
  }

  uv_cond_signal(&start_cond_);
  uv_mutex_unlock(&start_lock_);
}

void GrpcAgent::do_stop() {
  if (!unauthorized_) {
    send_exit();
  }

  log_exporter_.reset();
  metrics_exporter_.reset();
  trace_exporter_.reset();
  ready_ = false;
  span_collector_.reset();
  profile_collector_.reset();
  asset_done_msg_.close();
  command_msg_.close();
  command_stream_done_msg_.close();
  log_msg_.close();
  auth_timer_.close();
  config_msg_.close();
  metrics_timer_.close();
  metrics_msg_.close();
  blocked_loop_msg_.close();
  env_msg_.close();
  shutdown_.close();
  start_profiling_msg_.close();
}

void GrpcAgent::got_spans(const UniqRecordables& recordables) {
  Debug("# Spans Exporting: %ld\n", recordables.size());
  auto result =
      trace_exporter_->Export(const_cast<UniqRecordables&>(recordables));
  Debug("# Result: %d\n", static_cast<int>(result));
}

void GrpcAgent::got_asset_done_msg() {
  AssetStream::AssetStor stor;
  while (asset_done_q_.dequeue(stor)) {
    nsuv::ns_mutex::scoped_lock lock(profile_state_lock_);
    ProfileState& profile_state = profile_state_[stor.type];
    // get and remove associated data from pending_profiles_map
    auto it = profile_state.pending_profiles_map.find(stor.thread_id);
    if (it != profile_state.pending_profiles_map.end()) {
      ProfileStor& prof_stor = it->second;
      if (stor.stream == prof_stor.stream) {
        delete prof_stor.stream;
        prof_stor.stream = nullptr;
        if (prof_stor.done) {
          profile_state.pending_profiles_map.erase(it);
          profile_state.nr_profiles--;
        }
      } else {
        delete stor.stream;
      }
    } else {
      delete stor.stream;
    }
  }

  check_exit_on_profile();
}


void GrpcAgent::got_blocked_loop_msgs() {
  BlockedLoopStor stor;
  while (blocked_loop_msg_q_.dequeue(stor)) {
    if (stor.blocked) {
      send_blocked_loop_event(std::move(stor));
    } else {
      send_unblocked_loop_event(std::move(stor));
    }
  }
}

void GrpcAgent::got_logs() {
  std::vector<std::unique_ptr<LogsRecordable>> recordables;
  LogInfoStor stor;
  while (log_msg_q_.dequeue(stor)) {
    auto recordable = log_exporter_->MakeRecordable();
    otlp::fill_log_recordable(recordable.get(), stor.info);
    recordables.push_back(std::move(recordable));
  }

  auto result = log_exporter_->Export(recordables);
  Debug("# Logs Exported: %ld. Result: %d\n",
        recordables.size(),
        static_cast<int>(result));
}

void GrpcAgent::got_proc_metrics() {
  ASSERT_EQ(0, proc_metrics_.Update());
  ProcessMetrics::MetricsStor stor = proc_metrics_.Get();
  std::vector<MetricData> metrics;
  otlp::fill_proc_metrics(metrics, stor, proc_prev_stor_, false);
  ResourceMetrics data;
  data.resource_ = otlp::GetResource();
  data.scope_metric_data_ =
    std::vector<ScopeMetrics>{{otlp::GetScope(), metrics}};
  auto result = metrics_exporter_->Export(data);
  Debug("# ProcessMetrics Exported. Result: %d\n", static_cast<int>(result));
  proc_prev_stor_ = stor;
}

void GrpcAgent::got_profile(const ProfileCollector::ProfileQStor& stor) {
  google::protobuf::Struct metadata;
  uint64_t thread_id;
  std::visit([&metadata, &thread_id](auto& opt) {
    thread_id = opt.thread_id;
    metadata = opt.metadata_pb;
  }, stor.options);

  nsuv::ns_mutex::scoped_lock lock(profile_state_lock_);
  bool profileStreamComplete = stor.profile.length() == 0;
  ProfileState& profile_state = profile_state_[stor.type];
  // get and remove associated data from pending_profiles_map
  auto it = profile_state.pending_profiles_map.find(thread_id);
  ASSERT(it != profile_state.pending_profiles_map.end());
  ProfileStor& prof_stor = it->second;

  Debug("got_profile. len: %ld, status: %d. thread_id: %ld. req_id: %s\n", stor.profile.length(), stor.status, thread_id, prof_stor.req_id.c_str());

  if (thread_id == 0) {
    // Store the req_id of the main thread profile
    profile_state.last_main_profile = prof_stor.req_id;
  }

  if (stor.status < 0) {
    // Send error message back
    auto error = translate_error(stor.status);
    if (error == ErrorType::EUnknown) {
      error = ErrorType::EProfSnapshotError;
    }

    prof_stor.done = true;
    send_asset_error(stor.type, prof_stor.req_id, std::move(prof_stor.options), prof_stor.stream, error);
    return;
  }

  // if the profile is complete signal that
  if (profileStreamComplete) {
    prof_stor.done = true;
    if (prof_stor.stream == nullptr) {
      // The stream has been closed, so we can't send the profile
      profile_state.pending_profiles_map.erase(it);
      return;
    }
    prof_stor.stream->WritesDone();
  } else {
    if (prof_stor.stream == nullptr) {
      // The stream has been closed, so we can't send the profile
      return;
    }

    // send profile chunks
    grpcagent::Asset asset;
    PopulateCommon(asset.mutable_common(), ProfileTypeStr[stor.type], prof_stor.req_id.c_str());
    asset.set_thread_id(thread_id);
    asset.mutable_metadata()->CopyFrom(metadata);
    asset.set_data(stor.profile);

    size_t asset_size = asset.ByteSizeLong();
    if (asset_size > GRPC_MAX_SIZE) {
      // Split the data into chunks
      Debug("Asset size larger than supported (%ld > %ld): splitting profile into chunks\n", asset_size, GRPC_MAX_SIZE);
      size_t prof_size = stor.profile.size();
      size_t rest = asset_size - prof_size;
      size_t offset = 0;
      size_t chunk_size = GRPC_MAX_SIZE - rest - 100;

      while (offset < prof_size) {
        grpcagent::Asset chunk_asset;
        PopulateCommon(chunk_asset.mutable_common(), ProfileTypeStr[stor.type], prof_stor.req_id.c_str());
        chunk_asset.set_thread_id(thread_id);
        chunk_asset.mutable_metadata()->CopyFrom(metadata);

        if (offset + chunk_size > prof_size) {
          chunk_size = prof_size - offset;
        }

        chunk_asset.set_data(stor.profile.substr(offset, chunk_size));
        Debug("Sending chunk of size: %ld\n", chunk_asset.ByteSizeLong());
        prof_stor.stream->Write(std::move(chunk_asset));
        offset += chunk_size;
      }
    } else {
      prof_stor.stream->Write(std::move(asset));
    }
  }
}

void GrpcAgent::handle_command_request(CommandRequestStor&& req) {
  const grpcagent::CommandRequest& request = req.request;
  Debug("Command Received: %s\n", request.DebugString().c_str());
  command_stream_->Write(grpcagent::CommandResponse());
  const std::string cmd = request.command();
  if (cmd == "info") {
    send_info_event(request.requestid().c_str());
  } else if (cmd == "metrics") {
    send_metrics_event(request.requestid().c_str());
  } else if (cmd == "packages") {
    send_packages_event(request.requestid().c_str());
  } else if (cmd == "reconfigure") {
    reconfigure(request);
  } else if (cmd == "profile") {
    start_cpu_profile(request);
  } else if (cmd == "heap_profile") {
    start_heap_profile(request);
  } else if (cmd == "heap_sampling") {
    start_heap_sampling(request);
  } else if (cmd == "snapshot") {
    start_heap_snapshot(request);
  } else if (cmd == "startup_times") {
    send_startup_times_event(request.requestid().c_str());
  }
}

void GrpcAgent::parse_saas_token(const std::string& token) {
  std::string pubKey = token.substr(0, 40);
  std::replace(pubKey.begin(), pubKey.end(), ',', '!');
  std::string saasUrl = token.substr(40, token.length());
  std::string baseUrl;
  std::string basePort;
  std::istringstream saasStream(saasUrl);
  std::getline(saasStream, baseUrl, ':');
  std::getline(saasStream, basePort, ':');

  if (baseUrl.empty() || basePort.empty() || pubKey.length() != 40) {
    Debug("Invalid SaaS token: %s\n", token.c_str());
    return;
  }

  saas_ = token;
  console_id_ = baseUrl.substr(0, baseUrl.find('.'));
}

bool GrpcAgent::pending_profiles() const {
  // Check if there are any pending profiles on every profile_state_ by checking
  // the nr_profiles field of each
  nsuv::ns_mutex::scoped_lock lock(profile_state_lock_);
  for (const auto& p : profile_state_) {
    if (p.nr_profiles > 0) {
      return true;
    }
  }

  return false;
}

void GrpcAgent::reconfigure(const grpcagent::CommandRequest& request) {
  const grpcagent::ReconfigureBody& body = request.args().reconfigure();
  json out = json::object();
  if (body.has_blockedloopthreshold()) {
      out["blockedLoopThreshold"] = body.blockedloopthreshold();
  }
  if (body.has_interval()) {
      out["interval"] = body.interval();
  }
  if (body.has_pausemetrics()) {
      out["pauseMetrics"] = body.pausemetrics();
  }
  if (body.has_promisetracking()) {
      out["promiseTracking"] = body.promisetracking();
  }
  if (body.has_redactsnapshots()) {
      out["redactSnapshots"] = body.redactsnapshots();
  }
  if (body.has_statsd()) {
      out["statsd"] = body.statsd();
  }
  if (body.has_statsdbucket()) {
      out["statsdBucket"] = body.statsdbucket();
  }
  if (body.has_statsdtags()) {
      out["statsdTags"] = body.statsdtags();
  }
  if (body.tags_size() > 0) {
      out["tags"] = json::array();
      for (int i = 0; i < body.tags_size(); i++) {
        out["tags"].push_back(body.tags(i));
      }
  }
  if (body.has_tracingenabled()) {
      out["tracingEnabled"] = body.tracingenabled();
  }
  if (body.has_tracingmodulesblacklist()) {
      out["tracingModulesBlacklist"] = body.tracingmodulesblacklist();
  }

  DebugJSON("Reconfigure out: \n%s\n", out);

  UpdateConfig(out.dump());

  send_reconfigure_event(request.requestid().c_str());
}

void GrpcAgent::send_asset_error(const ProfileType& type,
                                 const std::string& req_id,
                                 ProfileOptions&& options,
                                 AssetStream* stream,
                                 const ErrorType& error) {
  grpcagent::Asset asset;
  google::protobuf::Struct metadata;
  uint64_t thread_id;
  std::visit([&metadata, &thread_id](auto& opt) {
    thread_id = opt.thread_id;
    metadata = std::move(opt.metadata_pb);
  }, options);
  PopulateCommon(asset.mutable_common(), ProfileTypeStr[type], req_id.c_str());
  PopulateError(asset.mutable_common(), error);
  asset.mutable_metadata()->CopyFrom(metadata);
  stream->Write(std::move(asset));
  stream->WritesDone(true);
}

void GrpcAgent::send_blocked_loop_event(BlockedLoopStor&& stor) {
  google::protobuf::ArenaOptions arena_options;
  // It's easy to allocate datas larger than 1024 when we populate basic resource and attributes
  arena_options.initial_block_size = 1024;
  // When in batch mode, it's easy to export a large number of spans at once, we can alloc a lager
  // block to reduce memory fragments.
  arena_options.max_block_size = 65536;
  std::unique_ptr<google::protobuf::Arena> arena{new google::protobuf::Arena{arena_options}};

  grpcagent::BlockedLoopEvent* event = google::protobuf::Arena::Create<grpcagent::BlockedLoopEvent>(arena.get());
  PopulateBlockedLoopEvent(event, stor);

  auto context = GrpcClient::MakeClientContext(agent_id_, saas_);

  client_->DelegateAsyncExport(
    nsolid_service_stub_.get(), std::move(context), std::move(arena),
    std::move(*event),
    [](::grpc::Status,
        std::unique_ptr<google::protobuf::Arena> &&,
        const grpcagent::BlockedLoopEvent& event,
        grpcagent::EventResponse*) {
      return true;
    });
}

void GrpcAgent::send_exit() {
  google::protobuf::ArenaOptions arena_options;
  // It's easy to allocate datas larger than 1024 when we populate basic resource and attributes
  arena_options.initial_block_size = 1024;
  // When in batch mode, it's easy to export a large number of spans at once, we can alloc a lager
  // block to reduce memory fragments.
  arena_options.max_block_size = 65536;
  std::unique_ptr<google::protobuf::Arena> arena{new google::protobuf::Arena{arena_options}};

  grpcagent::ExitEvent* exit_event = google::protobuf::Arena::Create<grpcagent::ExitEvent>(arena.get());
  PopulateCommon(exit_event->mutable_common(), "exit", nullptr);
  grpcagent::ExitBody* exit_body = exit_event->mutable_body();
  exit_body->set_code(GetExitCode());
  auto* error = GetExitError();
  if (error) {
    grpcagent::Error* error_info = exit_body->mutable_error();
    error_info->set_message(std::get<0>(*error));
    error_info->set_stack(std::get<1>(*error));
  }

  if (profile_on_exit_) {
    ProfileState& cpu_profile_state = profile_state_[kCpu];
    exit_body->set_profile(cpu_profile_state.last_main_profile);
  }

  auto context = GrpcClient::MakeClientContext(agent_id_, saas_);
  uv_cond_t cond;
  uv_mutex_t lock;
  client_->DelegateAsyncExport(
    nsolid_service_stub_.get(), std::move(context), std::move(arena),
    std::move(*exit_event),
    [&lock, &cond](::grpc::Status,
        std::unique_ptr<google::protobuf::Arena> &&,
        const grpcagent::ExitEvent& event,
        grpcagent::EventResponse*) {
      uv_mutex_lock(&lock);
      uv_cond_signal(&cond);
      uv_mutex_unlock(&lock);
      return true;
    });

  // wait for the exit event to be sent
  uv_mutex_init(&lock);
  uv_cond_init(&cond);
  uv_mutex_lock(&lock);
  uv_cond_wait(&cond, &lock);
  uv_mutex_unlock(&lock);
  uv_cond_destroy(&cond);
  uv_mutex_destroy(&lock);
}

void GrpcAgent::send_info_event(const char* req_id) {
  google::protobuf::ArenaOptions arena_options;
  // It's easy to allocate datas larger than 1024 when we populate basic resource and attributes
  arena_options.initial_block_size = 1024;
  // When in batch mode, it's easy to export a large number of spans at once, we can alloc a lager
  // block to reduce memory fragments.
  arena_options.max_block_size = 65536;
  std::unique_ptr<google::protobuf::Arena> arena{new google::protobuf::Arena{arena_options}};

  grpcagent::InfoEvent* info_event =
      google::protobuf::Arena::Create<grpcagent::InfoEvent>(arena.get());

  nlohmann::json info = json::parse(GetProcessInfo(), nullptr, false);
  if (info.is_discarded()) {
    Debug("Error parsing process info\n");
    PopulateCommon(info_event->mutable_common(), "info", req_id);
    PopulateError(info_event->mutable_common(), ErrorType::EInfoParsingError);
  } else {
    PopulateInfoEvent(info_event, info, req_id);
  }

  auto context = GrpcClient::MakeClientContext(agent_id_, saas_);

  client_->DelegateAsyncExport(
    nsolid_service_stub_.get(), std::move(context), std::move(arena),
    std::move(*info_event),
    [](::grpc::Status,
        std::unique_ptr<google::protobuf::Arena>&&,
        const grpcagent::InfoEvent& info_event,
        grpcagent::EventResponse*) {
      return true;
    });
}

void GrpcAgent::send_metrics_event(const char* req_id) {
  google::protobuf::ArenaOptions arena_options;
  // It's easy to allocate datas larger than 1024 when we populate basic resource and attributes
  arena_options.initial_block_size = 1024;
  // When in batch mode, it's easy to export a large number of spans at once, we can alloc a lager
  // block to reduce memory fragments.
  arena_options.max_block_size = 65536;
  std::unique_ptr<google::protobuf::Arena> arena{new google::protobuf::Arena{arena_options}};

  grpcagent::MetricsEvent* metrics_event =
      google::protobuf::Arena::Create<grpcagent::MetricsEvent>(arena.get());

  PopulateMetricsEvent(metrics_event, proc_prev_stor_, thr_metrics_cache_, req_id);

  auto context = GrpcClient::MakeClientContext(agent_id_, saas_);

  client_->DelegateAsyncExport(
    nsolid_service_stub_.get(), std::move(context), std::move(arena),
    std::move(*metrics_event),
    [](::grpc::Status,
        std::unique_ptr<google::protobuf::Arena>&&,
        const grpcagent::MetricsEvent& metrics_event,
        grpcagent::EventResponse*) {
      return true;
    });
}

void GrpcAgent::send_packages_event(const char* req_id) {
  google::protobuf::ArenaOptions arena_options;
  // It's easy to allocate datas larger than 1024 when we populate basic resource and attributes
  arena_options.initial_block_size = 1024;
  // When in batch mode, it's easy to export a large number of spans at once, we can alloc a lager
  // block to reduce memory fragments.
  arena_options.max_block_size = 65536;
  std::unique_ptr<google::protobuf::Arena> arena{new google::protobuf::Arena{arena_options}};

  auto packages_event = google::protobuf::Arena::Create<grpcagent::PackagesEvent>(arena.get());
  PopulatePackagesEvent(packages_event, req_id);

  auto context = GrpcClient::MakeClientContext(agent_id_, saas_);

  client_->DelegateAsyncExport(
    nsolid_service_stub_.get(), std::move(context), std::move(arena),
    std::move(*packages_event),
    [](::grpc::Status,
        std::unique_ptr<google::protobuf::Arena>&&,
        const grpcagent::PackagesEvent& info_event,
        grpcagent::EventResponse*) {
      return true;
    });
}

void GrpcAgent::send_reconfigure_event(const char* req_id) {
  google::protobuf::ArenaOptions arena_options;
  // It's easy to allocate datas larger than 1024 when we populate basic resource and attributes
  arena_options.initial_block_size = 1024;
  // When in batch mode, it's easy to export a large number of spans at once, we can alloc a lager
  // block to reduce memory fragments.
  arena_options.max_block_size = 65536;
  std::unique_ptr<google::protobuf::Arena> arena{new google::protobuf::Arena{arena_options}};

  auto reconfigure_event = google::protobuf::Arena::Create<grpcagent::ReconfigureEvent>(arena.get());
  PopulateReconfigureEvent(reconfigure_event, req_id);

  auto context = GrpcClient::MakeClientContext(agent_id_, saas_);

  client_->DelegateAsyncExport(
    nsolid_service_stub_.get(), std::move(context), std::move(arena),
    std::move(*reconfigure_event),
    [](::grpc::Status,
        std::unique_ptr<google::protobuf::Arena>&&,
        const grpcagent::ReconfigureEvent& info_event,
        grpcagent::EventResponse*) {
      return true;
    });
}

void GrpcAgent::send_startup_times_event(const char* req_id) {
  google::protobuf::ArenaOptions arena_options;
  // It's easy to allocate datas larger than 1024 when we populate basic resource and attributes
  arena_options.initial_block_size = 1024;
  // When in batch mode, it's easy to export a large number of spans at once, we can alloc a lager
  // block to reduce memory fragments.
  arena_options.max_block_size = 65536;
  std::unique_ptr<google::protobuf::Arena> arena{new google::protobuf::Arena{arena_options}};

  auto st_event = google::protobuf::Arena::Create<grpcagent::StartupTimesEvent>(arena.get());
  PopulateStartupTimesEvent(st_event, req_id);

  auto context = GrpcClient::MakeClientContext(agent_id_, saas_);

  client_->DelegateAsyncExport(
    nsolid_service_stub_.get(), std::move(context), std::move(arena),
    std::move(*st_event),
    [](::grpc::Status status,
        std::unique_ptr<google::protobuf::Arena>&&,
        const grpcagent::StartupTimesEvent& info_event,
        grpcagent::EventResponse*) {
      Debug("StartupTimesEvent: %s\n", status.error_message().c_str());
      return true;
    });
}

void GrpcAgent::send_unblocked_loop_event(BlockedLoopStor&& stor) {
  google::protobuf::ArenaOptions arena_options;
  // It's easy to allocate datas larger than 1024 when we populate basic resource and attributes
  arena_options.initial_block_size = 1024;
  // When in batch mode, it's easy to export a large number of spans at once, we can alloc a lager
  // block to reduce memory fragments.
  arena_options.max_block_size = 65536;
  std::unique_ptr<google::protobuf::Arena> arena{new google::protobuf::Arena{arena_options}};

  grpcagent::UnblockedLoopEvent* event = google::protobuf::Arena::Create<grpcagent::UnblockedLoopEvent>(arena.get());
  PopulateUnblockedLoopEvent(event, stor);

  auto context = GrpcClient::MakeClientContext(agent_id_, saas_);

  client_->DelegateAsyncExport(
    nsolid_service_stub_.get(), std::move(context), std::move(arena),
    std::move(*event),
    [](::grpc::Status,
        std::unique_ptr<google::protobuf::Arena> &&,
        const grpcagent::UnblockedLoopEvent& event,
        grpcagent::EventResponse*) {
      return true;
    });
}

void GrpcAgent::setup_blocked_loop_hooks() {
  auto it = config_.find("blockedLoopThreshold");
  if (it != config_.end()) {
    uint64_t threshold = *it;
    OnBlockedLoopHook(threshold, loop_blocked_, weak_from_this());
    OnUnblockedLoopHook(loop_unblocked_, weak_from_this());
  }
}

int GrpcAgent::setup_metrics_timer(uint64_t period) {
  if (period == 0) {
    return metrics_timer_.stop();
  }

  // There's no need to stop the timer previously as uv_timer_start() stops the
  // timer if active.
  return metrics_timer_.start(metrics_timer_cb_, period, period, weak_from_this());
}

ErrorType GrpcAgent::do_start_prof_init(
    const grpcagent::CommandRequest& req,
    const ProfileType& type,
    ProfileOptions& options) {
  const grpcagent::ProfileArgs& args = req.args().profile();
  uint64_t thread_id = args.thread_id();
  uint64_t duration = args.duration();
  StartProfiling start_profiling = nullptr;
  switch (type) {
    case ProfileType::kCpu:
      start_profiling = &GrpcAgent::do_start_cpu_prof;
    break;
    case ProfileType::kHeapProf:
      start_profiling = &GrpcAgent::do_start_heap_prof;
    break;
    case ProfileType::kHeapSampl:
      start_profiling = &GrpcAgent::do_start_heap_sampl;
    break;
    case ProfileType::kHeapSnapshot:
      start_profiling = &GrpcAgent::do_start_heap_snapshot;
    break;
    default:
      ASSERT(false);
  }

    // Set common fields in options
  std::visit([&](auto& opt) {
    opt.thread_id = thread_id;
    opt.duration = duration;
    opt.metadata_pb = std::move(args.metadata());
  }, options);

  ErrorType error = (this->*start_profiling)(args, options);
  if (error != ErrorType::ESuccess) {
    return error;
  }

  nsuv::ns_mutex::scoped_lock lock(profile_state_lock_);
  ProfileState& profile_state = profile_state_[type];
  ProfileStor stor{ req.requestid(), uv_now(&loop_), nullptr, std::move(options) };
  auto iter = profile_state.pending_profiles_map.emplace(thread_id,
                                                         std::move(stor));
  if (iter.second == false) {
    return ErrorType::EInProgressError;
  }

  if (type != kHeapSnapshot) {
    profile_state.nr_profiles++;
  }

  return ErrorType::ESuccess;
}

ErrorType GrpcAgent::do_start_prof_end(ErrorType err,
                                       const std::string& req_id,
                                       const ProfileType& type,
                                       ProfileOptions&& opts) {
  uint64_t thread_id =
    std::visit([](auto&& opt) { return opt.thread_id; }, opts);
  AssetStream* stream = new AssetStream(nsolid_service_stub_.get(),
                                        weak_from_this(),
                                        AssetStream::AssetStor{type, thread_id});
  if (err != ErrorType::ESuccess) {
    send_asset_error(type, req_id, std::move(opts), stream, err);
    return err;
  }

  nsuv::ns_mutex::scoped_lock lock(profile_state_lock_);
  ProfileState& profile_state = profile_state_[type];
  auto it = profile_state.pending_profiles_map.find(thread_id);
  ASSERT(it != profile_state.pending_profiles_map.end());
  ProfileStor& prof_stor = it->second;
  ASSERT(prof_stor.stream == nullptr);
  prof_stor.stream = stream;

  return ErrorType::ESuccess;
}

ErrorType GrpcAgent::do_start_cpu_prof(const grpcagent::ProfileArgs&,
                                       ProfileOptions& opts) {
  CPUProfileOptions& options = std::get<CPUProfileOptions>(opts);
  int ret = profile_collector_->StartCPUProfile(options);
  return translate_error(ret);
}

ErrorType GrpcAgent::do_start_heap_prof(const grpcagent::ProfileArgs& args,
                                        ProfileOptions& opts) {
  HeapProfileOptions& options = std::get<HeapProfileOptions>(opts);
  options.track_allocations = args.heap_profile().track_allocations();
  auto it = config_.find("redactSnapshots");
  if (it != config_.end()) {
    if (it->is_boolean()) {
      options.redacted = *it;
    }
  }

  int ret = profile_collector_->StartHeapProfile(options);
  return translate_error(ret);
}

ErrorType GrpcAgent::do_start_heap_sampl(const grpcagent::ProfileArgs& args,
                                         ProfileOptions& opts) {
  HeapSamplingOptions& options = std::get<HeapSamplingOptions>(opts);
  const auto& heap_sampling = args.heap_sampling();
  options.sample_interval = heap_sampling.sample_interval();
  if (options.sample_interval == 0) {
    options.sample_interval = 512 * 1024;
  }

  options.stack_depth = heap_sampling.stack_depth();
  if (options.stack_depth == 0) {
    options.stack_depth = 16;
  }

  options.flags = static_cast<v8::HeapProfiler::SamplingFlags>(heap_sampling.flags());
  int ret = profile_collector_->StartHeapSampling(options);
  return translate_error(ret);
}

ErrorType GrpcAgent::do_start_heap_snapshot(const grpcagent::ProfileArgs& args,
                                            ProfileOptions& opts) {
  HeapSnapshotOptions& options = std::get<HeapSnapshotOptions>(opts);
  bool disable_snapshots = false;
  auto it = config_.find("disableSnapshots");
  if (it != config_.end()) {
    disable_snapshots = *it;
  }

  if (disable_snapshots == true) {
    return ErrorType::ESnapshotDisabled;
  }

  it = config_.find("redactSnapshots");
  if (it != config_.end()) {
    if (it->is_boolean()) {
      options.redacted = *it;
    }
  }

  int ret = profile_collector_->StartHeapSnapshot(options);
  return translate_error(ret);
}

void GrpcAgent::update_tracer(uint32_t flags) {
  span_collector_.reset();
  if (trace_flags_) {
    span_collector_ = std::make_shared<SpanCollector>(&loop_,
                                                      trace_flags_,
                                                      span_msg_q_min_size,
                                                      span_timer_interval);
    span_collector_->CollectAndTransform(
      +[](const Tracer::SpanStor& span, WeakGrpcAgent agent_wp)
          -> UniqRecordable {
        SharedGrpcAgent agent = agent_wp.lock();
        if (agent == nullptr) {
          return nullptr;
        }

        auto recordable = agent->trace_exporter_->MakeRecordable();
        otlp::fill_recordable(recordable.get(), span);
        return recordable;
      },
      +[](UniqRecordables& spans, WeakGrpcAgent agent_wp) {
        SharedGrpcAgent agent = agent_wp.lock();
        if (agent == nullptr) {
          return;
        }

        agent->got_spans(spans);
      },
      weak_from_this());
  }
}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node
