#ifndef AGENTS_OTLP_SRC_DYNATRACE_METRICS_H_
#define AGENTS_OTLP_SRC_DYNATRACE_METRICS_H_

#include "metrics_exporter.h"
#include "http_client.h"

namespace node {
namespace nsolid {
namespace otlp {

class DynatraceMetrics final: public MetricsExporter {
 public:
  DynatraceMetrics(uv_loop_t* loop,
                   const std::string& endpoint,
                   const std::string& auth_header);
  virtual ~DynatraceMetrics();

  virtual void got_proc_metrics(const ProcessMetrics::MetricsStor& stor,
                                const ProcessMetrics::MetricsStor& prev_stor);

  virtual void got_thr_metrics(
      const std::vector<MetricsExporter::ThrMetricsStor>&);


 private:
  std::string got_thr_metrics(const ThreadMetrics::MetricsStor& stor,
                              const ThreadMetrics::MetricsStor& prev_stor);

  uv_loop_t* loop_;
  std::unique_ptr<OTLPHttpClient> http_client_;
  std::string auth_header_;
  std::string endpoint_;
};

}  // namespace otlp
}  // namespace nsolid
}  // namespace node


#endif  // AGENTS_OTLP_SRC_DYNATRACE_METRICS_H_
