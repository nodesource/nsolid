#ifndef AGENTS_OTLP_SRC_OTLP_METRICS_H_
#define AGENTS_OTLP_SRC_OTLP_METRICS_H_

// NOLINTNEXTLINE(build/c++11)
#include <chrono>

#include "metrics_exporter.h"
#include "opentelemetry/version.h"

// Class pre-declaration
OPENTELEMETRY_BEGIN_NAMESPACE
namespace sdk {
namespace metrics {
class PushMetricExporter;
}
}
OPENTELEMETRY_END_NAMESPACE

namespace node {
namespace nsolid {
namespace otlp {

// Class pre-declaration
class OTLPAgent;

class OTLPMetrics final: public MetricsExporter {
 public:
  explicit OTLPMetrics(uv_loop_t* loop,
                       const OTLPAgent& agent);
  explicit OTLPMetrics(uv_loop_t* loop,
                       const std::string& url,
                       const std::string& key,
                       bool is_http,
                       const OTLPAgent& agent);
  virtual ~OTLPMetrics();

  virtual void got_proc_metrics(const ProcessMetrics::MetricsStor& stor,
                                const ProcessMetrics::MetricsStor& prev_stor);

  virtual void got_thr_metrics(
      const std::vector<MetricsExporter::ThrMetricsStor>&);

 private:
  std::unique_ptr<OPENTELEMETRY_NAMESPACE::sdk::metrics::PushMetricExporter>
    otlp_metric_exporter_;
  std::string key_;
  std::string url_;
  std::chrono::system_clock::time_point start_;
  const OTLPAgent& agent_;
};

}  // namespace otlp
}  // namespace nsolid
}  // namespace node


#endif  // AGENTS_OTLP_SRC_OTLP_METRICS_H_
