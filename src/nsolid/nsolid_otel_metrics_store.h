#ifndef SRC_NSOLID_NSOLID_OTEL_METRICS_STORE_H_
#define SRC_NSOLID_NSOLID_OTEL_METRICS_STORE_H_

#include <stdint.h>
#include <chrono>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "nsolid_otel_metrics_types.h"
#include "opentelemetry/sdk/metrics/aggregation/histogram_aggregation.h"

#include "uv.h"

namespace node {
namespace nsolid {

// Stores synchronous OpenTelemetry metrics owned by one Environment thread.
class OtelMetrics {
 public:
  OtelMetrics() : thread_id_(uv_thread_self()) {}

  struct Instrument {
    struct Value {
      std::string attributes;
      double value = 0;
      std::unique_ptr<opentelemetry::sdk::metrics::DoubleHistogramAggregation>
          histogram;
    };

    std::string meter_name;
    std::string meter_version;
    std::string meter_schema_url;
    std::string name;
    std::string unit;
    std::string description;
    OtelMetricType type{};
    std::chrono::system_clock::time_point started_at;
    std::optional<std::vector<double>> histogram_boundaries;
    std::vector<Value> values;
    std::unordered_map<std::string, size_t> value_indices;
    // Retained only for one observable collection to replace overflowed sets.
    std::unordered_map<std::string, double> overflow_observations;
  };

  using InstrumentsStor = std::vector<Instrument>;

  int RegisterInstrument(std::string meter_name,
                         std::string meter_version,
                         std::string meter_schema_url,
                         std::string name,
                         std::string unit,
                         std::string description,
                         uint32_t* instrument_id,
                         OtelMetricType type,
                         std::optional<std::vector<double>>
                             histogram_boundaries = std::nullopt);
  int AddInstrument(uint32_t instrument_id,
                    double value,
                    std::string attributes);
  void ClearObservableValues();
  void Disable();
  const InstrumentsStor& Get() const;

 private:
  static constexpr size_t kMaxAttributeSets = 2000;

  void AssertThread() const;

  uv_thread_t thread_id_;
  InstrumentsStor instruments_;
  std::unordered_map<std::string, std::string> normalized_attributes_;
};

}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_NSOLID_OTEL_METRICS_STORE_H_
