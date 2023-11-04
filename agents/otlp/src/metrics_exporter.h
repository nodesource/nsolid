#ifndef AGENTS_OTLP_SRC_METRICS_EXPORTER_H_
#define AGENTS_OTLP_SRC_METRICS_EXPORTER_H_

#include <utility>
#include <vector>

#include "nsolid.h"

namespace node {
namespace nsolid {
namespace otlp {

class MetricsExporter {
 public:
  virtual ~MetricsExporter() {}

  virtual void got_proc_metrics(
      const ProcessMetrics::MetricsStor& stor,
      const ProcessMetrics::MetricsStor& prev_stor) = 0;

  virtual void got_thr_metrics(
      const std::vector<std::pair<ThreadMetrics::MetricsStor,
                                  ThreadMetrics::MetricsStor>>&) = 0;
};

}  // namespace otlp
}  // namespace nsolid
}  // namespace node


#endif  // AGENTS_OTLP_SRC_METRICS_EXPORTER_H_
