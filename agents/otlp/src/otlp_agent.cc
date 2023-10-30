#include "otlp_agent.h"
#include "debug_utils-inl.h"
#include "datadog_metrics.h"
#include "dynatrace_metrics.h"
#include "newrelic_metrics.h"
#include "opentelemetry/sdk/resource/resource.h"
#include "opentelemetry/sdk/trace/recordable.h"
#include "opentelemetry/exporters/otlp/otlp_http_exporter.h"
#include "opentelemetry/trace/propagation/detail/hex.h"

using ThreadMetricsStor = node::nsolid::ThreadMetrics::MetricsStor;
using nlohmann::json;

namespace nostd = OPENTELEMETRY_NAMESPACE::nostd;
namespace sdk = OPENTELEMETRY_NAMESPACE::sdk;
namespace exporter = OPENTELEMETRY_NAMESPACE::exporter;
namespace trace = OPENTELEMETRY_NAMESPACE::trace;
namespace resource = sdk::resource;
namespace detail = trace::propagation::detail;

static const size_t kTraceIdSize             = 32;
static const size_t kSpanIdSize              = 16;

static std::atomic<bool> is_running_ = { false };
static resource::ResourceAttributes resource_attributes_;

namespace node {
namespace nsolid {
namespace otlp {

template <typename... Args>
inline void Debug(Args&&... args) {
  per_process::Debug(DebugCategory::NSOLID_OTLP_AGENT,
                     std::forward<Args>(args)...);
}

inline void DebugJSON(const char* str, const json& msg) {
  if (UNLIKELY(per_process::enabled_debug_list.enabled(
        DebugCategory::NSOLID_OTLP_AGENT))) {
    Debug(str, msg.dump(4).c_str());
  }
}


OTLPAgent* OTLPAgent::Inst() {
  static OTLPAgent agent;
  return &agent;
}


OTLPAgent::OTLPAgent(): ready_(false),
                        hooks_init_(false),
                        trace_flags_(0),
                        otlp_http_exporter_(nullptr),
                        metrics_interval_(0),
                        proc_metrics_(),
                        proc_prev_stor_(),
                        config_(json::object()) {
  ASSERT_EQ(0, uv_loop_init(&loop_));
  ASSERT_EQ(0, uv_cond_init(&start_cond_));
  ASSERT_EQ(0, uv_mutex_init(&start_lock_));
  ASSERT_EQ(0, exit_lock_.init(true));
  is_running_ = true;
}


OTLPAgent::~OTLPAgent() {
  {
    nsuv::ns_rwlock::scoped_wrlock lock(exit_lock_);
    is_running_ = false;
  }
  ASSERT_EQ(0, stop());
  uv_mutex_destroy(&start_lock_);
  uv_cond_destroy(&start_cond_);
  ASSERT_EQ(0, uv_loop_close(&loop_));
}


int OTLPAgent::start() {
  int r = 0;
  if (ready_ == false) {
    uv_mutex_lock(&start_lock_);
    r = thread_.create(run_, this);
    if (r == 0) {
      while (ready_ == false) {
        uv_cond_wait(&start_cond_, &start_lock_);
      }
    }

    uv_mutex_unlock(&start_lock_);
  }

  return r;
}


int OTLPAgent::stop() {
  int r = 0;
  if (ready_ == true) {
    r = shutdown_.send();
    if (r != 0) {
      return r;
    }

    r = thread_.join();
    if (r != 0) {
      return r;
    }
  }

  return r;
}

using string_vector = std::vector<std::string>;
static string_vector apm_fields({ "/datadog",
                                  "/dynatrace",
                                  "/newrelic",
                                  "/otlp" });

static string_vector metrics_fields({ "/interval",
                                      "/pauseMetrics" });

static string_vector otlp_fields({ "/otlp",
                                   "/otlpConfig" });

static string_vector tracing_fields({ "/tracingEnabled",
                                      "/tracingModulesBlacklist" });


int OTLPAgent::config(const nlohmann::json& config) {
  json diff = json::diff(config_, config);
  DebugJSON("Old Config: \n%s\n", config_);
  DebugJSON("NewConfig: \n%s\n", config);
  DebugJSON("Diff: \n%s\n", diff);
  config_ = config;
  if (utils::find_any_fields_in_diff(diff, otlp_fields)) {
    config_otlp_agent(config_);
  }

  // Configure tracing flags
  if (trace_flags_ == 0 ||
      utils::find_any_fields_in_diff(diff, tracing_fields)) {
    trace_flags_ = 0;
    if (otlp_http_exporter_ != nullptr) {
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
      utils::find_any_fields_in_diff(diff, metrics_fields)) {
    uint64_t period = 0;
    if (metrics_exporter_ != nullptr) {
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
    }

    metrics_interval_ = period;
    return setup_metrics_timer(metrics_interval_);
  }

  return 0;
}


/*static*/ void OTLPAgent::run_(nsuv::ns_thread*, OTLPAgent* agent) {
  agent->do_start();
  do {
    ASSERT_EQ(0, uv_run(&agent->loop_, UV_RUN_DEFAULT));
  } while (uv_loop_alive(&agent->loop_));
}

/*static*/ void OTLPAgent::shutdown_cb_(nsuv::ns_async*, OTLPAgent* agent) {
  agent->do_stop();
}


/*static*/ void OTLPAgent::config_agent_cb_(std::string config,
                                            OTLPAgent* agent) {
  // Check if the agent is already delete or if it's closing
  nsuv::ns_rwlock::scoped_rdlock lock(agent->exit_lock_);
  if (!is_running_) {
    return;
  }

  json cfg = json::parse(config, nullptr, false);
  // assert because the runtime should never send me an invalid JSON config
  ASSERT(!cfg.is_discarded());
  agent->config_msg_q_.enqueue(cfg);
  ASSERT_EQ(0, agent->config_msg_.send());
}


/*static*/ void OTLPAgent::config_msg_cb_(nsuv::ns_async*, OTLPAgent* agent) {
  json config_msg;
  while (agent->config_msg_q_.dequeue(config_msg)) {
    agent->config(config_msg);
  }
}


/*static*/ void OTLPAgent::env_msg_cb_(nsuv::ns_async*, OTLPAgent* agent) {
  nsuv::ns_rwlock::scoped_rdlock lock(agent->exit_lock_);
  if (!is_running_) {
    return;
  }

  std::tuple<SharedEnvInst, bool> tup;
  while (agent->env_msg_q_.dequeue(tup)) {
    SharedEnvInst envinst = std::get<0>(tup);
    bool creation = std::get<1>(tup);
    if (creation) {
      auto pair = agent->env_metrics_map_.emplace(
        std::piecewise_construct,
        std::forward_as_tuple(GetThreadId(envinst)),
        std::forward_as_tuple(envinst));
      ASSERT(pair.second);
    } else {
      ASSERT_EQ(1, agent->env_metrics_map_.erase(GetThreadId(envinst)));
    }
  }
}


/*static*/ void OTLPAgent::on_thread_add_(SharedEnvInst envinst,
                                          OTLPAgent* agent) {
  nsuv::ns_rwlock::scoped_rdlock lock(agent->exit_lock_);
  if (!is_running_) {
    return;
  }

  agent->env_msg_q_.enqueue({ envinst, true });
  ASSERT_EQ(0, agent->env_msg_.send());
}


/*static*/ void OTLPAgent::on_thread_remove_(SharedEnvInst envinst,
                                             OTLPAgent* agent) {
  nsuv::ns_rwlock::scoped_rdlock lock(agent->exit_lock_);
  if (!is_running_) {
    return;
  }

  agent->env_msg_q_.enqueue({ envinst, false });
  ASSERT_EQ(0, agent->env_msg_.send());
}


void OTLPAgent::do_start() {
  uv_mutex_lock(&start_lock_);
  ASSERT_EQ(0, shutdown_.init(&loop_, shutdown_cb_, this));
  ASSERT_EQ(0, env_msg_.init(&loop_, env_msg_cb_, this));
  ASSERT_EQ(0, span_msg_.init(&loop_, span_msg_cb_, this));
  ASSERT_EQ(0, metrics_msg_.init(&loop_, metrics_msg_cb_, this));
  ASSERT_EQ(0, metrics_timer_.init(&loop_));
  ASSERT_EQ(0, config_msg_.init(&loop_, config_msg_cb_, this));

  if (!hooks_init_) {
    ASSERT_EQ(0, OnConfigurationHook(config_agent_cb_, this));
    ASSERT_EQ(0, ThreadAddedHook(on_thread_add_, this));
    ASSERT_EQ(0, ThreadRemovedHook(on_thread_remove_, this));
    hooks_init_ = true;
  }

  ready_ = true;

  uv_cond_signal(&start_cond_);
  uv_mutex_unlock(&start_lock_);
}


void OTLPAgent::do_stop() {
  shutdown_.close();
  env_msg_.close();
  span_msg_.close();
  metrics_msg_.close();
  metrics_timer_.close();
  config_msg_.close();
  metrics_exporter_.reset(nullptr);
  ready_ = false;
}


void OTLPAgent::trace_hook_(Tracer* tracer,
                            const Tracer::SpanStor& stor,
                            OTLPAgent* agent) {
  nsuv::ns_rwlock::scoped_rdlock lock(agent->exit_lock_);
  if (!is_running_) {
    return;
  }

  agent->span_msg_q_.enqueue(stor);
  ASSERT_EQ(0, agent->span_msg_.send());
}


void OTLPAgent::span_msg_cb_(nsuv::ns_async*, OTLPAgent* agent) {
  // Don't exit until all the pending spans are sent
  nsuv::ns_rwlock::scoped_rdlock lock(agent->exit_lock_);
  if (!is_running_) {
    return;
  }

  using std::chrono::duration_cast;
  using time_point = std::chrono::system_clock::time_point;
  using std::chrono::milliseconds;
  using std::chrono::nanoseconds;
  auto resource = resource::Resource::Create(resource_attributes_);
  std::vector<std::unique_ptr<sdk::trace::Recordable>> recordables;
  Tracer::SpanStor s;
  while (agent->span_msg_q_.dequeue(s)) {
    auto recordable = agent->otlp_http_exporter_->MakeRecordable();
    recordable->SetName(s.name);
    time_point start{
        duration_cast<time_point::duration>(
          milliseconds(static_cast<uint64_t>(s.start)))};
    recordable->SetStartTime(start);
    recordable->SetDuration(
      nanoseconds(static_cast<uint64_t>((s.end - s.start) * 1e6)));

    uint8_t span_buf[kSpanIdSize / 2];
    detail::HexToBinary(s.span_id, span_buf, sizeof(span_buf));

    uint8_t parent_buf[kSpanIdSize / 2];
    detail::HexToBinary(s.parent_id, parent_buf, sizeof(parent_buf));

    uint8_t trace_buf[kTraceIdSize / 2];
    detail::HexToBinary(s.trace_id, trace_buf, sizeof(trace_buf));

    trace::SpanContext ctx(trace::TraceId(trace_buf),
                           trace::SpanId(span_buf),
                           trace::TraceFlags(0),
                           false);

    trace::SpanId parent_id(parent_buf);

    recordable->SetIdentity(ctx, parent_id);

    recordable->SetSpanKind(static_cast<trace::SpanKind>(s.kind));

    json attrs = json::parse(s.attrs);
    ASSERT(!attrs.is_discarded());
    for (const auto& attr : attrs.items()) {
      const json val = attr.value();
      if (val.is_boolean())
        recordable->SetAttribute(attr.key(), attr.value().get<bool>());
      else if (val.is_number_integer())
        recordable->SetAttribute(attr.key(), attr.value().get<int64_t>());
      else if (val.is_number_unsigned())
        recordable->SetAttribute(attr.key(), attr.value().get<uint64_t>());
      else if (val.is_number_float())
        recordable->SetAttribute(attr.key(), attr.value().get<double>());
      else if (val.is_string())
        recordable->SetAttribute(attr.key(), attr.value().get<std::string>());
    }

    recordable->SetAttribute("thread.id", s.thread_id);

    recordable->SetResource(resource);

    recordables.push_back(std::move(recordable));
  }

  nostd::span<std::unique_ptr<sdk::trace::Recordable>> batch(recordables);
  auto result = agent->otlp_http_exporter_->Export(batch);
  Debug("# Spans Exported: %ld. Result: %d\n",
        recordables.size(),
        static_cast<int>(result));
  // ASSERT_EQ(sdk::common::ExportResult::kSuccess, result);
}


/*static*/void OTLPAgent::metrics_timer_cb_(nsuv::ns_timer*, OTLPAgent* agent) {
  nsuv::ns_rwlock::scoped_rdlock lock(agent->exit_lock_);
  if (!is_running_) {
    return;
  }

  agent->got_proc_metrics();
  for (auto& item : agent->env_metrics_map_) {
    // Retrieve metrics from the Metrics API. Ignore any return error since
    // there's nothing to be done.
    item.second.metrics_.Update(thr_metrics_cb_, agent);
  }
}


/*static*/void OTLPAgent::metrics_msg_cb_(nsuv::ns_async*, OTLPAgent* agent) {
  nsuv::ns_rwlock::scoped_rdlock lock(agent->exit_lock_);
  if (!is_running_) {
    return;
  }

  std::vector<std::pair<ThreadMetricsStor,
                        ThreadMetricsStor>> thr_metrics_vector;
  ThreadMetrics* m;
  while (agent->thr_metrics_msg_q_.dequeue(&m)) {
    auto it = agent->env_metrics_map_.find(m->thread_id());
    if (it != agent->env_metrics_map_.end()) {
      auto& metrics = it->second;
      ThreadMetricsStor stor = m->Get();
      thr_metrics_vector.emplace_back(stor, metrics.prev_);
      metrics.prev_ = stor;
    }
  }

  if (agent->metrics_exporter_) {
    agent->metrics_exporter_->got_thr_metrics(thr_metrics_vector);
  }
}


/*static*/void OTLPAgent::thr_metrics_cb_(ThreadMetrics* metrics,
                                          OTLPAgent* agent) {
  nsuv::ns_rwlock::scoped_rdlock lock(agent->exit_lock_);
  if (!is_running_) {
    return;
  }

  agent->thr_metrics_msg_q_.enqueue(metrics);
  ASSERT_EQ(0, uv_async_send(&agent->metrics_msg_));
}


void OTLPAgent::config_datadog(const json& config) {
  std::string url;
  std::string metrics_url;
  auto it = config.find("zone");
  ASSERT(it != config.end());
  std::string zone = *it;
  if (zone == "eu") {
    metrics_url += "https://api.datadoghq.eu/api/v1/series";
  } else {  // zone == "us"
    metrics_url += "https://api.datadoghq.com/api/v1/series";
  }

  it = config.find("key");
  ASSERT(it != config.end());
  std::string key = *it;
  exporter::otlp::OtlpHttpExporterOptions opts;
  it = config.find("url");
  ASSERT(it != config.end());
  opts.url = it->get<std::string>() + "/v1/traces";
  setup_trace_otlp_exporter(opts);
  metrics_exporter_.reset(new DatadogMetrics(&loop_, metrics_url, key));
}


void OTLPAgent::config_dynatrace(const json& config) {
  auto it = config.find("site");
  ASSERT(it != config.end());
  std::string url = std::string("https://") +
                    it->get<std::string>() +
                    std::string(".live.dynatrace.com");
  it = config.find("token");
  ASSERT(it != config.end());
  std::string auth_header = std::string("Api-Token ") + it->get<std::string>();
  exporter::otlp::OtlpHttpExporterOptions opts;
  opts.url = url + "/api/v2/otlp/v1/traces";
  opts.http_headers.insert(std::make_pair("Authorization",
                                          auth_header.c_str()));
  setup_trace_otlp_exporter(opts);
  metrics_exporter_.reset(new DynatraceMetrics(&loop_, url, auth_header));
}


void OTLPAgent::config_endpoint(const std::string& type,
                                const json& config) {
  if (type == "datadog") {
    config_datadog(config);
    return;
  }

  if (type == "dynatrace") {
    config_dynatrace(config);
    return;
  }

  if (type == "newrelic") {
    config_newrelic(config);
    return;
  }

  if (type == "otlp") {
    config_otlp_endpoint(config);
    return;
  }
}


void OTLPAgent::config_newrelic(const json& config) {
  std::string url;
  std::string metrics_url;
  auto it = config.find("zone");
  ASSERT(it != config.end());
  std::string zone = *it;
  if (zone == "eu") {
    url += "https://otlp.eu01.nr-data.net:4318";
    metrics_url += "https://metric-api.eu.newrelic.com/metric/v1";
  } else {  // zone == "us"
    url += "https://otlp.nr-data.net:4318";
    metrics_url += "https://metric-api.newrelic.com/metric/v1";
  }

  it = config.find("key");
  ASSERT(it != config.end());
  std::string key = *it;
  exporter::otlp::OtlpHttpExporterOptions opts;
  opts.url = url + "/v1/traces";
  opts.http_headers.insert(std::make_pair("api-key", key.c_str()));
  setup_trace_otlp_exporter(opts);
  metrics_exporter_.reset(new NewRelicMetrics(&loop_, metrics_url, key));
}


void OTLPAgent::config_otlp_agent(const json& config) {
  auto it = config.find("otlp");
  if (it != config.end()) {
    // Reset the otlp and metrics exporters and reconfigure endpoints.
    otlp_http_exporter_.reset(nullptr);
    metrics_exporter_.reset(nullptr);
    std::string type = *it;
    it = config.find("otlpConfig");
    ASSERT(it != config.end());
    const nlohmann::json& otlp = it.value();
    config_endpoint(type, otlp);
    config_service(config);
  } else {
    Debug("No otlp agent configuration. Stopping the agent\n");
    stop();
  }
}


void OTLPAgent::config_otlp_endpoint(const json& config) {
  auto it = config.find("url");
  ASSERT(it != config.end());
  exporter::otlp::OtlpHttpExporterOptions opts;
  opts.url = it->get<std::string>() + "/v1/traces";
  setup_trace_otlp_exporter(opts);
}


void OTLPAgent::config_service(const json& config) {
  auto it = config.find("app");
  ASSERT(it != config.end());
  resource_attributes_.SetAttribute("service.name", it->get<std::string>());
  resource_attributes_.SetAttribute("service.version", "1.0.0");
  it = config.find("appVersion");
  if (it != config.end()) {
    resource_attributes_.SetAttribute("service.version",
                                      it->get<std::string>());
  }
}


void OTLPAgent::got_proc_metrics() {
  ASSERT_EQ(0, proc_metrics_.Update());
  ProcessMetrics::MetricsStor stor = proc_metrics_.Get();
  if (metrics_exporter_) {
    metrics_exporter_->got_proc_metrics(stor, proc_prev_stor_);
  }

  proc_prev_stor_ = stor;
}


void OTLPAgent::setup_trace_otlp_exporter(
    exporter::otlp::OtlpHttpExporterOptions& opts) {
  opts.content_type  = exporter::otlp::HttpRequestContentType::kBinary;
  opts.console_debug = true;
  otlp_http_exporter_.reset(new exporter::otlp::OtlpHttpExporter(opts));
}


int OTLPAgent::setup_metrics_timer(uint64_t period) {
  if (period == 0) {
    return metrics_timer_.stop();
  }

  // There's no need to stop the timer previously as uv_timer_start() stops the
  // timer if active.
  return metrics_timer_.start(metrics_timer_cb_, period, period, this);
}

void OTLPAgent::update_tracer(uint32_t flags) {
  tracer_.reset(nullptr);
  if (flags) {
    Tracer* tracer = Tracer::CreateInstance(flags, trace_hook_, this);
    ASSERT_NOT_NULL(tracer);
    tracer_.reset(tracer);
  }
}

}  // namespace otlp
}  // namespace nsolid
}  // namespace node
