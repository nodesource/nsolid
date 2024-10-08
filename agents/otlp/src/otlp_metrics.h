#ifndef AGENTS_OTLP_SRC_OTLP_METRICS_H_
#define AGENTS_OTLP_SRC_OTLP_METRICS_H_


#include "metrics_exporter.h"
#include "opentelemetry/version.h"

// Class pre-declaration
OPENTELEMETRY_BEGIN_NAMESPACE
namespace sdk {
namespace instrumentationscope {
class InstrumentationScope;
}  // namespace instrumentationscope
namespace metrics {
class PushMetricExporter;
}  // namespace metrics
namespace resource {
class Resource;
}  // namespace resource
}  // namespace sdk
OPENTELEMETRY_END_NAMESPACE

namespace node {
namespace nsolid {
namespace otlp {

// Class pre-declaration
class OTLPAgent;

class OTLPMetrics final: public MetricsExporter {
 public:
  explicit OTLPMetrics(
    uv_loop_t* loop,
    OPENTELEMETRY_NAMESPACE::sdk::instrumentationscope::InstrumentationScope*);
  explicit OTLPMetrics(
    uv_loop_t* loop,
    const std::string& url,
    const std::string& key,
    bool is_http,
    OPENTELEMETRY_NAMESPACE::sdk::instrumentationscope::InstrumentationScope*);

  virtual ~OTLPMetrics();

  virtual void got_proc_metrics(const ProcessMetrics::MetricsStor& stor,
                                const ProcessMetrics::MetricsStor& prev_stor);

  virtual void got_thr_metrics(
      const std::vector<MetricsExporter::ThrMetricsStor>&);

 private:
  std::unique_ptr<OPENTELEMETRY_NAMESPACE::sdk::metrics::PushMetricExporter>
    otlp_metric_exporter_;
  OPENTELEMETRY_NAMESPACE::sdk::instrumentationscope::InstrumentationScope*
    scope_;
  std::string key_;
  std::string url_;
};

}  // namespace otlp
}  // namespace nsolid
}  // namespace node


#endif  // AGENTS_OTLP_SRC_OTLP_METRICS_H_
