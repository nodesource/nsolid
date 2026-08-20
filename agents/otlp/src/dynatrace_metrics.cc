#include "dynatrace_metrics.h"

#include <algorithm>

#include "asserts-cpp/asserts.h"

using ProcessMetricsStor = node::nsolid::ProcessMetrics::MetricsStor;
using ThreadMetricsStor = node::nsolid::ThreadMetrics::MetricsStor;

namespace node {
namespace nsolid {
namespace otlp {

static std::vector<std::string> discarded_metrics = {
  "thread_id", "timestamp"
};

DynatraceMetrics::DynatraceMetrics(uv_loop_t* loop,
                                   const std::string& endpoint,
                                   const std::string& auth_header):
    loop_(loop),
    auth_header_(auth_header),
    endpoint_(endpoint + "/api/v2/metrics/ingest") {
  http_client_.reset(new OTLPHttpClient(loop_));
}

/*virtual*/
DynatraceMetrics::~DynatraceMetrics() {
}

/*virtual*/
void DynatraceMetrics::got_proc_metrics(const ProcessMetricsStor& stor,
                                        const ProcessMetricsStor& prev_stor) {
  std::string metrics;

#define V(CType, CName, JSName, MType, Unit)                                   \
{                                                                              \
  auto it = std::find(discarded_metrics.begin(),                               \
                      discarded_metrics.end(),                                 \
                      #CName);                                                 \
  if (it == discarded_metrics.end()) {                                         \
    switch (MetricsType::MType) {                                              \
      case MetricsType::ECounter:                                              \
      {                                                                        \
        metrics += "nsolid."#CName;                                            \
        metrics += " count,delta=";                                            \
        metrics += std::to_string(stor.CName - prev_stor.CName);               \
        metrics += "\n";                                                       \
      }                                                                        \
      break;                                                                   \
      case MetricsType::EGauge:                                                \
      {                                                                        \
        metrics += "nsolid."#CName;                                            \
        metrics += " gauge,";                                                  \
        metrics += std::to_string(stor.CName);                                 \
        metrics += "\n";                                                       \
      }                                                                        \
      break;                                                                   \
      default:                                                                 \
      break;                                                                   \
    }                                                                          \
  }                                                                            \
}
  NSOLID_PROCESS_METRICS_NUMBERS(V)
#undef V

  http_client_->post_dynatrace_metrics(endpoint_,
                                       auth_header_,
                                       metrics);
}

/*virtual*/
void DynatraceMetrics::got_thr_metrics(
    const std::vector<MetricsExporter::ThrMetricsStor>& thr_metrics) {
  std::string metrics;
  for (const auto& tm : thr_metrics) {
    metrics += got_thr_metrics(tm.stor, tm.prev_stor);
  }

  if (metrics.size() > 0) {
    http_client_->post_dynatrace_metrics(endpoint_,
                                         auth_header_,
                                         metrics);
  }
}

std::string DynatraceMetrics::got_thr_metrics(
    const ThreadMetricsStor& stor,
    const ThreadMetricsStor& prev_stor) {
  std::string metrics;
#define V(CType, CName, JSName, MType, Unit)                                   \
{                                                                              \
  auto it = std::find(discarded_metrics.begin(),                               \
                      discarded_metrics.end(),                                 \
                      #CName);                                                 \
  if (it == discarded_metrics.end()) {                                         \
    switch (MetricsType::MType) {                                              \
      case MetricsType::ECounter:                                              \
      {                                                                        \
        metrics += "nsolid."#CName;                                            \
        metrics += ",thread_id=" + std::to_string(stor.thread_id);             \
        metrics += " count,delta=";                                            \
        metrics += std::to_string(stor.CName - prev_stor.CName);               \
        metrics += "\n";                                                       \
      }                                                                        \
      break;                                                                   \
      case MetricsType::EGauge:                                                \
      {                                                                        \
        metrics += "nsolid."#CName;                                            \
        metrics += " gauge,";                                                  \
        metrics += std::to_string(stor.CName);                                 \
        metrics += "\n";                                                       \
      }                                                                        \
      break;                                                                   \
      default:                                                                 \
      break;                                                                   \
    }                                                                          \
  }                                                                            \
}
  NSOLID_ENV_METRICS_NUMBERS(V)
#undef V
  return metrics;
}

}  // namespace otlp
}  // namespace nsolid
}  // namespace node
