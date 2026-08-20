#ifndef AGENTS_OTLP_SRC_NEWRELIC_METRICS_H_
#define AGENTS_OTLP_SRC_NEWRELIC_METRICS_H_

#include "metrics_exporter.h"
#include "http_client.h"
#include "nlohmann/json.h"

namespace node {
namespace nsolid {
namespace otlp {

class NewRelicMetrics final: public MetricsExporter {
 public:
  NewRelicMetrics(uv_loop_t* loop,
                  const std::string& url,
                  const std::string& key);
  virtual ~NewRelicMetrics();

  virtual void got_proc_metrics(const ProcessMetrics::MetricsStor& stor,
                                const ProcessMetrics::MetricsStor& prev_stor);

  void got_thr_metrics(
      const std::vector<MetricsExporter::ThrMetricsStor>&);

 private:
  nlohmann::json got_thr_metrics(const ThreadMetrics::MetricsStor& stor,
                                 const ThreadMetrics::MetricsStor& prev_stor);

  uv_loop_t* loop_;
  std::unique_ptr<OTLPHttpClient> http_client_;
  std::string key_;
  std::string url_;
};

}  // namespace otlp
}  // namespace nsolid
}  // namespace node


#endif  // AGENTS_OTLP_SRC_NEWRELIC_METRICS_H_
