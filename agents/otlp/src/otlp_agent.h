#ifndef AGENTS_OTLP_SRC_OTLP_AGENT_H_
#define AGENTS_OTLP_SRC_OTLP_AGENT_H_

#include <nsolid.h>
#include <nsolid/thread_safe.h>
#include <memory>
#include "nlohmann/json.hpp"

#include "asserts-cpp/asserts.h"
#include "metrics_exporter.h"


// Class pre-declaration
namespace opentelemetry {
inline namespace v1 {
namespace exporter {
namespace otlp {
class OtlpHttpExporter;
struct OtlpHttpExporterOptions;
}
}
}
}

namespace node {
namespace nsolid {

namespace otlp {

struct JSThreadMetrics {
  SharedThreadMetrics metrics_;
  ThreadMetrics::MetricsStor prev_;
  explicit JSThreadMetrics(SharedEnvInst envinst)
    : metrics_(ThreadMetrics::Create(envinst)),
      prev_() {}
};

class OTLPAgent {
 public:
  static OTLPAgent* Inst();

  int start();

  int stop();

  int config(const nlohmann::json& config);

 private:
  OTLPAgent();

  ~OTLPAgent();

  static void run_(nsuv::ns_thread*, OTLPAgent*);

  static void shutdown_cb_(nsuv::ns_async*, OTLPAgent*);

  static void config_agent_cb_(std::string, OTLPAgent*);

  static void config_msg_cb_(nsuv::ns_async*, OTLPAgent*);

  static void env_msg_cb_(nsuv::ns_async*, OTLPAgent*);

  static void on_thread_add_(SharedEnvInst, OTLPAgent* agent);

  static void on_thread_remove_(SharedEnvInst, OTLPAgent* agent);

  static void trace_hook_(Tracer* tracer,
                          const Tracer::SpanStor& stor,
                          OTLPAgent* agent);

  static void span_msg_cb_(nsuv::ns_async*, OTLPAgent* agent);

  static void metrics_timer_cb_(nsuv::ns_timer*, OTLPAgent*);

  static void metrics_msg_cb_(nsuv::ns_async*, OTLPAgent* agent);

  static void thr_metrics_cb_(SharedThreadMetrics, OTLPAgent*);

  void do_start();

  void do_stop();

  void config_datadog(const nlohmann::json& config);

  void config_dynatrace(const nlohmann::json& config);

  void config_endpoint(const std::string& type,
                       const nlohmann::json& config);

  void config_newrelic(const nlohmann::json& config);

  void config_otlp_agent(const nlohmann::json& config);

  void config_otlp_endpoint(const nlohmann::json& config);

  void config_service(const nlohmann::json& service);

  void got_proc_metrics();

  void setup_trace_otlp_exporter(  // NOLINTNEXTLINE(runtime/references)
    opentelemetry::v1::exporter::otlp::OtlpHttpExporterOptions& opts);

  int setup_metrics_timer(uint64_t period);

  void update_tracer(uint32_t flags);

  uv_loop_t loop_;
  nsuv::ns_thread thread_;
  nsuv::ns_async shutdown_;

  // For otlp thread start synchronization
  std::atomic<bool> ready_;
  uv_cond_t start_cond_;
  uv_mutex_t start_lock_;

  bool hooks_init_;

  nsuv::ns_async env_msg_;
  TSQueue<std::tuple<SharedEnvInst, bool>> env_msg_q_;

  // For the Tracing API
  std::unique_ptr<Tracer> tracer_;
  nsuv::ns_async span_msg_;
  TSQueue<Tracer::SpanStor> span_msg_q_;
  uint32_t trace_flags_;

  std::unique_ptr<opentelemetry::v1::exporter::otlp::OtlpHttpExporter>
    otlp_http_exporter_;

  // For the Metrics API
  uint64_t metrics_interval_;
  ProcessMetrics proc_metrics_;
  ProcessMetrics::MetricsStor proc_prev_stor_;
  std::map<uint64_t, JSThreadMetrics> env_metrics_map_;
  nsuv::ns_async metrics_msg_;
  TSQueue<ThreadMetrics::MetricsStor> thr_metrics_msg_q_;
  nsuv::ns_timer metrics_timer_;
  std::unique_ptr<MetricsExporter> metrics_exporter_;

  // For the Configuration API
  nsuv::ns_async config_msg_;
  TSQueue<nlohmann::json> config_msg_q_;
  nlohmann::json config_;
};

}  // namespace otlp
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_OTLP_SRC_OTLP_AGENT_H_
