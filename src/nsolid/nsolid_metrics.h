#ifndef SRC_NSOLID_NSOLID_METRICS_H_
#define SRC_NSOLID_NSOLID_METRICS_H_

#include <memory>
#include <unordered_map>
#include <vector>

#include "nsolid.h"
#include "opentelemetry/sdk/metrics/data/point_data.h"
#include "opentelemetry/sdk/metrics/aggregation/base2_exponential_histogram_aggregation.h"
#include "opentelemetry/sdk/metrics/state/attributes_hashmap.h"

namespace node {
namespace nsolid {

// Type alias for histogram point data attributes vector
using PointDataAttributesVector =
    std::vector<opentelemetry::sdk::metrics::PointDataAttributes>;

// Shared pointer to point data attributes (used for histogram caching)
using SharedPointDataAttributes =
    std::shared_ptr<PointDataAttributesVector>;

struct HttpHistogramSnapshot {
  uint64_t start_timestamp_ms;
  uint64_t end_timestamp_ms;
  SharedPointDataAttributes client_points;
  SharedPointDataAttributes server_points;
};

// Type alias for attributes hashmap (used for metric aggregation)
using AttributesHashMap = opentelemetry::sdk::metrics::AttributesHashMap;

// Unique pointer to attributes hashmap
using UniqueAttributesHashMap = std::unique_ptr<AttributesHashMap>;

constexpr size_t kHttpHistogramCardinalityLimit =
    opentelemetry::sdk::metrics::kAggregationCardinalityLimit;

opentelemetry::sdk::metrics::MetricAttributes BuildMetricAttributes(
    const MetricsStream::HttpDatapointAttrs& http,
    MetricsStream::Type type);

void AggregateHttpHistogram(
    AttributesHashMap* hashmap,
    double value,
    opentelemetry::sdk::metrics::MetricAttributes&& metric_attrs);

void MergeHttpHistogramPoints(SharedPointDataAttributes& accumulated,
                              const SharedPointDataAttributes& next,
                              size_t cardinality_limit =
                                  kHttpHistogramCardinalityLimit);

}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_NSOLID_METRICS_H_
