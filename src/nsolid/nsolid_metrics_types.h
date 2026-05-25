#ifndef SRC_NSOLID_NSOLID_METRICS_TYPES_H_
#define SRC_NSOLID_NSOLID_METRICS_TYPES_H_

#include "opentelemetry/sdk/metrics/data/point_data.h"
#include "opentelemetry/sdk/metrics/aggregation/base2_exponential_histogram_aggregation.h"
#include "opentelemetry/sdk/metrics/state/attributes_hashmap.h"
#include <memory>
#include <vector>

namespace node {
namespace nsolid {

// Type alias for histogram point data attributes vector
using PointDataAttributesVector =
    std::vector<opentelemetry::sdk::metrics::PointDataAttributes>;

// Shared pointer to point data attributes (used for histogram caching)
using SharedPointDataAttributes =
    std::shared_ptr<PointDataAttributesVector>;

// Type alias for attributes hashmap (used for metric aggregation)
using AttributesHashMap = opentelemetry::sdk::metrics::AttributesHashMap;

// Unique pointer to attributes hashmap
using UniqueAttributesHashMap = std::unique_ptr<AttributesHashMap>;

constexpr size_t kHttpHistogramCardinalityLimit =
    opentelemetry::sdk::metrics::kAggregationCardinalityLimit;

}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_NSOLID_METRICS_TYPES_H_
