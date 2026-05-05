#ifndef AGENTS_OTLP_SRC_BATCHED_METRIC_DATA_H_
#define AGENTS_OTLP_SRC_BATCHED_METRIC_DATA_H_

#include <vector>

#include "opentelemetry/nostd/variant.h"
#include "opentelemetry/sdk/common/attribute_utils.h"
#include "opentelemetry/sdk/metrics/data/point_data.h"
#include "opentelemetry/sdk/metrics/instruments.h"
#include "opentelemetry/version.h"

namespace node {
namespace nsolid {
namespace otlp {

using opentelemetry::sdk::metrics::SumPointData;
using opentelemetry::sdk::metrics::HistogramPointData;
using opentelemetry::sdk::metrics::Base2ExponentialHistogramPointData;
using opentelemetry::sdk::metrics::LastValuePointData;
using opentelemetry::sdk::metrics::DropPointData;
using opentelemetry::sdk::metrics::SummaryPointData;
using opentelemetry::sdk::metrics::AggregationTemporality;
using opentelemetry::sdk::metrics::InstrumentDescriptor;
using PointAttributes = opentelemetry::sdk::common::OrderedAttributeMap;
using PointType =
    opentelemetry::nostd::variant<SumPointData,
                                  HistogramPointData,
                                  Base2ExponentialHistogramPointData,
                                  LastValuePointData,
                                  DropPointData,
                                  SummaryPointData>;

struct TimedPointDataAttributes {
  opentelemetry::common::SystemTimestamp start_ts;
  opentelemetry::common::SystemTimestamp end_ts;
  PointAttributes attributes;
  PointType point_data;
};

class BatchedMetricData {
 public:
  InstrumentDescriptor instrument_descriptor;
  AggregationTemporality aggregation_temporality;
  std::vector<TimedPointDataAttributes> point_data_attr_;
};

}  // namespace otlp
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_OTLP_SRC_BATCHED_METRIC_DATA_H_
