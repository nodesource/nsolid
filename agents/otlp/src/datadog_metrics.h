#ifndef AGENTS_OTLP_SRC_DATADOG_METRICS_H_
#define AGENTS_OTLP_SRC_DATADOG_METRICS_H_

#include "metrics_exporter.h"
#include "http_client.h"
#include "nlohmann/json.h"

namespace node {
namespace nsolid {
namespace otlp {

class DatadogMetrics final: public MetricsExporter {
 public:
  DatadogMetrics(uv_loop_t* loop,
                 const std::string& url,
                 const std::string& key);
  virtual ~DatadogMetrics();

  virtual void got_proc_metrics(const ProcessMetrics::MetricsStor& stor,
                                const ProcessMetrics::MetricsStor& prev_stor);

  void got_thr_metrics(const std::vector<MetricsExporter::ThrMetricsStor>&);

 private:
  void got_thr_metrics(const ThreadMetrics::MetricsStor& stor,
                       const ThreadMetrics::MetricsStor& prev_stor,
                       nlohmann::json& series);  // NOLINT(runtime/references)

  uv_loop_t* loop_;
  std::unique_ptr<OTLPHttpClient> http_client_;
  std::string key_;
  std::string url_;
};

}  // namespace otlp
}  // namespace nsolid
}  // namespace node


#endif  // AGENTS_OTLP_SRC_DATADOG_METRICS_H_
