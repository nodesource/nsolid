#include "grpc_agent.h"
#include "grpc_client.h"

#include "asserts-cpp/asserts.h"
#include "debug_utils-inl.h"
#include "nsolid/nsolid_api.h"
#include "nsolid/nsolid_util.h"
#include "../../otlp/src/otlp_common.h"
#include "opentelemetry/sdk/metrics/data/metric_data.h"
#include "opentelemetry/sdk/metrics/export/metric_producer.h"
#include "opentelemetry/exporters/otlp/otlp_grpc_exporter.h"
#include "opentelemetry/exporters/otlp/otlp_grpc_log_record_exporter.h"
#include "opentelemetry/exporters/otlp/otlp_grpc_metric_exporter.h"

using json = nlohmann::json;
using ThreadMetricsStor = node::nsolid::ThreadMetrics::MetricsStor;
using opentelemetry::nostd::span;
using LogsRecordable = opentelemetry::sdk::logs::Recordable;
using opentelemetry::sdk::metrics::MetricData;
using opentelemetry::sdk::metrics::ResourceMetrics;
using opentelemetry::sdk::metrics::ScopeMetrics;
using opentelemetry::sdk::trace::Recordable;
using opentelemetry::v1::exporter::otlp::OtlpGrpcExporter;
using opentelemetry::v1::exporter::otlp::OtlpGrpcExporterOptions;
using opentelemetry::v1::exporter::otlp::OtlpGrpcLogRecordExporter;
using opentelemetry::v1::exporter::otlp::OtlpGrpcLogRecordExporterOptions;
using opentelemetry::v1::exporter::otlp::OtlpGrpcMetricExporter;
using opentelemetry::v1::exporter::otlp::OtlpGrpcMetricExporterOptions;

namespace node {
namespace nsolid {
namespace grpc {

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

void PopulateBlockedLoopEvent(grpcagent::BlockedLoopEvent* blocked_loop_event,
                              const GrpcAgent::BlockedLoopStor& stor) {
  // Fill in the fields of the BlockedLoopEvent.
  nlohmann::json body = json::parse(stor.body, nullptr, false);
  ASSERT(!body.is_discarded());

  grpcagent::CommonResponse* common = blocked_loop_event->mutable_common();
  common->set_agentid(GetAgentId());
  common->set_command("loop_blocked");

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
                       const char* req_id) {
  nlohmann::json info = json::parse(GetProcessInfo(), nullptr, false);
  if (info.is_discarded()) {
    Debug("Error parsing process info\n");
    return;
  }
  // ASSERT(!info.is_discarded());
  
  DebugJSON("Process Info: \n%s\n", info);

  // Fill in the fields of the InfoResponse.
  grpcagent::CommonResponse* common = info_event->mutable_common();
  common->set_agentid(GetAgentId());
  common->set_command("info");
  if (req_id) {
    common->set_requestid(req_id);
  }

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
  grpcagent::CommonResponse* common = packages_event->mutable_common();
  common->set_agentid(GetAgentId());
  common->set_command("packages");
  if (req_id) {
    common->set_requestid(req_id);
  }

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
    if (package.contains("main")) {
      proto_package->set_main(package["main"].get<std::string>());
    }
    
    if (package.contains("dependencies") && package["dependencies"].is_array()) {
      for (const auto& dep : package["dependencies"]) {
        proto_package->add_dependencies(dep.get<std::string>());
      }
    }

    if (package.contains("required")) {
      proto_package->set_required(package["required"].get<bool>());
    }
  }
}

void PopulateUnblockedLoopEvent(grpcagent::UnblockedLoopEvent* blocked_loop_event,
                                const GrpcAgent::BlockedLoopStor& stor) {
  // Fill in the fields of the BlockedLoopEvent.
  nlohmann::json body = json::parse(stor.body, nullptr, false);
  ASSERT(!body.is_discarded());

  grpcagent::CommonResponse* common = blocked_loop_event->mutable_common();
  common->set_agentid(GetAgentId());
  common->set_command("loop_unblocked");

  grpcagent::UnblockedLoopBody* blocked_body = blocked_loop_event->mutable_body();
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
                        trace_flags_(0),
                        proc_metrics_(),
                        proc_prev_stor_(),
                        config_(json::object()) {
  ASSERT_EQ(0, uv_loop_init(&loop_));
  ASSERT_EQ(0, uv_cond_init(&start_cond_));
  ASSERT_EQ(0, uv_mutex_init(&start_lock_));
  ASSERT_EQ(0, stop_lock_.init(true));
}

GrpcAgent::~GrpcAgent() {
  fprintf(stderr, "GrpcAgent::~GrpcAgent()\n");
}

void GrpcAgent::got_command_request(grpcagent::CommandRequest&& request) {
  if (command_q_.enqueue(std::move(request)) == 1) {
    ASSERT_EQ(0, command_msg_.send());
  }
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

int GrpcAgent::stop() {
  if (utils::are_threads_equal(thread_.base(), uv_thread_self())) {
    do_stop();
  } else {
    ASSERT_EQ(0, shutdown_.send());
    ASSERT_EQ(0, thread_.join());
  }

  return 0;
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

/*static*/ void GrpcAgent::blocked_loop_msg_cb_(nsuv::ns_async*,
                                                WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

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

  grpcagent::CommandRequest request;
  while (agent->command_q_.dequeue(request)) {
    agent->handle_command_request(std::move(request));
  }
}

/*static*/ void GrpcAgent::config_agent_cb_(std::string config,
                                            WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

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

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

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

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

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

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

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

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

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

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

  agent->got_logs();
}

/*static*/void GrpcAgent::loop_blocked_(SharedEnvInst envinst,
                                        std::string body,
                                        WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

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

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

  if (agent->blocked_loop_msg_q_.enqueue({ false, body, GetThreadId(envinst) }) == 1) {
    ASSERT_EQ(0, agent->blocked_loop_msg_.send());
  }
}

/*static*/void GrpcAgent::metrics_msg_cb_(nsuv::ns_async*, WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

  ResourceMetrics data;
  data.resource_ = otlp::GetResource();
  std::vector<MetricData> metrics;

  ThreadMetricsStor stor;
  while (agent->thr_metrics_msg_q_.dequeue(stor)) {
    otlp::fill_env_metrics(metrics, stor);
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

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

  agent->got_proc_metrics();
  for (auto& item : agent->env_metrics_map_) {
    // Retrieve metrics from the Metrics API. Ignore any return error since
    // there's nothing to be done.
    item.second.metrics_->Update(thr_metrics_cb_, agent_wp);
  }
}

/*static*/void GrpcAgent::span_msg_cb_(nsuv::ns_async*, WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

  std::vector<std::unique_ptr<Recordable>> recordables;
  Tracer::SpanStor s;
  while (agent->span_msg_q_.dequeue(s)) {
    auto recordable = agent->trace_exporter_->MakeRecordable();
    otlp::fill_recordable(recordable.get(), s);
    recordables.push_back(std::move(recordable));
  }

  span<std::unique_ptr<Recordable>> batch(recordables);
  auto result = agent->trace_exporter_->Export(batch);
  Debug("# Spans Exported: %ld. Result: %d\n",
        recordables.size(),
        static_cast<int>(result));
}

/*static*/void GrpcAgent::thr_metrics_cb_(SharedThreadMetrics metrics,
                                          WeakGrpcAgent agent_wp) {
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

  if (agent->thr_metrics_msg_q_.enqueue(metrics->Get()) == 1) {
    ASSERT_EQ(0, uv_async_send(&agent->metrics_msg_));
  }
}

/*static*/void GrpcAgent::trace_hook_(Tracer* tracer,
                                      const Tracer::SpanStor& stor,
                                      WeakGrpcAgent agent_wp) {
  
  SharedGrpcAgent agent = agent_wp.lock();
  if (agent == nullptr) {
    return;
  }

  // Check if the agent is closing
  // nsuv::ns_rwlock::scoped_rdlock lock(agent->stop_lock_);
  // if (agent->status_ == Unconfigured) {
  //   return;
  // }

  if (agent->span_msg_q_.enqueue(stor) == 1) {
    ASSERT_EQ(0, agent->span_msg_.send());
  }
}

static string_vector tracing_fields({ "/tracingEnabled",
                                      "/tracingModulesBlacklist" });


int GrpcAgent::config(const json& config) {
  int ret;

  json old_config = config_;
  config_ = config;
  json diff = json::diff(old_config, config_);
  DebugJSON("Old Config: \n%s\n", old_config);
  DebugJSON("NewConfig: \n%s\n", config_);
  DebugJSON("Diff: \n%s\n", diff);
  if (utils::find_any_fields_in_diff(diff, { "/grpc" })) {
    if (config_.contains("grpc")) {
      // Setup the client/s
      client_ = std::make_shared<GrpcClient>();
      nsolid_service_stub_ = GrpcClient::MakeNSolidServiceStub();
      OtlpGrpcExporterOptions options;
      options.endpoint = "localhost:50051";
      trace_exporter_ = std::make_unique<OtlpGrpcExporter>(options);
      OtlpGrpcMetricExporterOptions opts;
      opts.endpoint = "localhost:50051";
      metrics_exporter_ = std::make_unique<OtlpGrpcMetricExporter>(opts);
      OtlpGrpcLogRecordExporterOptions opt;
      opt.endpoint = "localhost:50051";
      log_exporter_ = std::make_unique<OtlpGrpcLogRecordExporter>(opt);
      command_stream_ =
        std::make_unique<CommandStream>(nsolid_service_stub_.get(), shared_from_this());
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

    return setup_metrics_timer(period);
  }

  return 0;
}

void GrpcAgent::do_start() {
  uv_mutex_lock(&start_lock_);

  ASSERT_EQ(0, shutdown_.init(&loop_, shutdown_cb_, weak_from_this()));

  ASSERT_EQ(0, env_msg_.init(&loop_, env_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, blocked_loop_msg_.init(&loop_, blocked_loop_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, config_msg_.init(&loop_, config_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, command_msg_.init(&loop_, command_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, log_msg_.init(&loop_, log_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, metrics_msg_.init(&loop_, metrics_msg_cb_, weak_from_this()));

  ASSERT_EQ(0, metrics_timer_.init(&loop_));

  ASSERT_EQ(0, span_msg_.init(&loop_, span_msg_cb_, weak_from_this()));

  ready_ = true;

  if (hooks_init_ == false) {
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
  ready_ = false;
  span_msg_.close();
  metrics_timer_.close();
  metrics_msg_.close();
  command_msg_.close();
  config_msg_.close();
  blocked_loop_msg_.close();
  env_msg_.close();
  shutdown_.close();
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

  // span<std::unique_ptr<Recordable>> batch(recordables);
  auto result = log_exporter_->Export(recordables);
  Debug("# Logs Exported: %ld. Result: %d\n",
        recordables.size(),
        static_cast<int>(result));
}

void GrpcAgent::got_proc_metrics() {
  ASSERT_EQ(0, proc_metrics_.Update());
  ProcessMetrics::MetricsStor stor = proc_metrics_.Get();
  ResourceMetrics data;
  data.resource_ = otlp::GetResource();
  std::vector<MetricData> metrics;
  otlp::fill_proc_metrics(metrics, stor);
  data.scope_metric_data_ =
    std::vector<ScopeMetrics>{{otlp::GetScope(), metrics}};
  auto result = metrics_exporter_->Export(data);
  Debug("# ProcessMetrics Exported. Result: %d\n", static_cast<int>(result));
}

void GrpcAgent::handle_command_request(grpcagent::CommandRequest&& request) {
  Debug("Command: %s\n", request.command().c_str());
  command_stream_->Write(grpcagent::CommandResponse());
  const std::string cmd = request.command();
  if (cmd == "info") {
    send_info_event(request.requestid().c_str());
  } else if (cmd == "packages") {
    send_packages_event(request.requestid().c_str());
  } else if (cmd == "reconfigure") {
    reconfigure(request);
  }
}

/*message CommandBody {
  oneof body {
    ReconfigureBody reconfigure = 1;
  }
}

message CommandRequest {
  string requestId = 1;
  uint32 version = 2;
  string id = 3;
  string command = 4;
  CommandBody body = 5;
}*/
void GrpcAgent::reconfigure(const grpcagent::CommandRequest& request) {
  const grpcagent::ReconfigureBody& body = request.body().reconfigure();
  /*
  message ReconfigureBody {
  uint32 blockedLoopThreshold = 1;
  uint32 interval = 2;
  bool pauseMetrics = 3;
  bool promiseTracking = 4;
  bool redactSnapshots = 5;
  string statsd = 6;
  string statsdBucket = 7;
  string statsdTags = 8;
  repeated string tags = 9;
  bool tracingEnabled = 10;
  uint32 tracingModulesBlacklist = 11;
}
  */
  json out = json::object();
  out["blockedLoopThreshold"] = body.blockedloopthreshold();
  out["interval"] = body.interval();
  out["pauseMetrics"] = body.pausemetrics();
  out["promiseTracking"] = body.promisetracking();
  out["redactSnapshots"] = body.redactsnapshots();
  out["statsd"] = body.statsd();
  out["statsdBucket"] = body.statsdbucket();
  out["statsdTags"] = body.statsdtags();
  if (body.tags_size() > 0) {
    out["tags"] = json::array();
    for (int i = 0; i < body.tags_size(); i++) {
      out["tags"].push_back(body.tags(i));
    }
  }
  out["tracingEnabled"] = body.tracingenabled();
  out["tracingModulesBlacklist"] = body.tracingmodulesblacklist();
  UpdateConfig(out.dump());
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

  auto context = GrpcClient::MakeClientContext();
  grpcagent::EventResponse* event_response = google::protobuf::Arena::Create<grpcagent::EventResponse>(arena.get());

  client_->DelegateAsyncExport(
    nsolid_service_stub_.get(), std::move(context), std::move(arena),
    std::move(*event),
    [](::grpc::Status,
        std::unique_ptr<google::protobuf::Arena> &&,
        const grpcagent::BlockedLoopEvent& event,
        grpcagent::EventResponse*) {
      fprintf(stderr, "ExportBlockedLoop() success\n");
      return true;
    });
}

void GrpcAgent::send_info_event(const char* req_id) {
  google::protobuf::ArenaOptions arena_options;
  // It's easy to allocate datas larger than 1024 when we populate basic resource and attributes
  arena_options.initial_block_size = 1024;
  // When in batch mode, it's easy to export a large number of spans at once, we can alloc a lager
  // block to reduce memory fragments.
  arena_options.max_block_size = 65536;
  std::unique_ptr<google::protobuf::Arena> arena{new google::protobuf::Arena{arena_options}};

  grpcagent::InfoEvent* info_event = google::protobuf::Arena::Create<grpcagent::InfoEvent>(arena.get());
  PopulateInfoEvent(info_event, req_id);

  auto context = GrpcClient::MakeClientContext();
  grpcagent::EventResponse* event_response = google::protobuf::Arena::Create<grpcagent::EventResponse>(arena.get());

  client_->DelegateAsyncExport(
    nsolid_service_stub_.get(), std::move(context), std::move(arena),
    std::move(*info_event),
    [](::grpc::Status,
        std::unique_ptr<google::protobuf::Arena>&&,
        const grpcagent::InfoEvent& info_event,
        grpcagent::EventResponse*) {
      fprintf(stderr, "ExportInfo() success\n");
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

  auto context = GrpcClient::MakeClientContext();
  grpcagent::EventResponse* event_response = google::protobuf::Arena::Create<grpcagent::EventResponse>(arena.get());

  client_->DelegateAsyncExport(
    nsolid_service_stub_.get(), std::move(context), std::move(arena),
    std::move(*packages_event),
    [](::grpc::Status,
        std::unique_ptr<google::protobuf::Arena>&&,
        const grpcagent::PackagesEvent& info_event,
        grpcagent::EventResponse*) {
      fprintf(stderr, "ExportPackages() success\n");
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

  auto context = GrpcClient::MakeClientContext();
  grpcagent::EventResponse* event_response = google::protobuf::Arena::Create<grpcagent::EventResponse>(arena.get());

  client_->DelegateAsyncExport(
    nsolid_service_stub_.get(), std::move(context), std::move(arena),
    std::move(*event),
    [](::grpc::Status,
        std::unique_ptr<google::protobuf::Arena> &&,
        const grpcagent::UnblockedLoopEvent& event,
        grpcagent::EventResponse*) {
      fprintf(stderr, "ExportUnblockedLoop() success\n");
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

void GrpcAgent::update_tracer(uint32_t flags) {
  Debug("Tracer Flags: %d\n", flags);
  tracer_.reset(nullptr);
  if (flags) {
    Tracer* tracer = Tracer::CreateInstance(flags, trace_hook_, weak_from_this());
    ASSERT_NOT_NULL(tracer);
    tracer_.reset(tracer);
  }
}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node
