#ifndef SRC_NSOLID_NSOLID_OTEL_METRICS_TYPES_H_
#define SRC_NSOLID_NSOLID_OTEL_METRICS_TYPES_H_

#include <chrono>
#include <optional>
#include <string>
#include <vector>

#include "opentelemetry/sdk/metrics/data/point_data.h"

namespace node {
namespace nsolid {

enum class OtelMetricType {
  kCounter,
  kGauge,
  kHistogram,
  kUpDownCounter,
  kObservableCounter,
  kObservableGauge,
  kObservableUpDownCounter,
};

struct OtelMetricStor {
  std::string meter_name;
  std::string meter_version;
  std::string meter_schema_url;
  std::string name;
  std::string unit;
  std::string description;
  double value;
  std::string attributes;
  OtelMetricType type = OtelMetricType::kCounter;
  std::chrono::system_clock::time_point started_at;
  std::chrono::system_clock::time_point collected_at;
  std::optional<opentelemetry::sdk::metrics::HistogramPointData>
      histogram_point_data;
};

using OtelMetricsStor = std::vector<OtelMetricStor>;

}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_NSOLID_OTEL_METRICS_TYPES_H_
