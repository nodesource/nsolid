#include "nsolid_api.h"
#include "nsolid_otel_metrics_store.h"

#include <cmath>

#include "nsolid_util.h"
#include "nlohmann/json.hpp"

namespace node {
namespace nsolid {

using opentelemetry::sdk::metrics::DoubleHistogramAggregation;
using opentelemetry::sdk::metrics::HistogramAggregationConfig;

static constexpr char kOtelMetricOverflowAttributes[] =
    R"({"otel.metric.overflow":true})";

static double replace_observation_value(double total,
                                        double previous,
                                        double value) {
  const double negative_previous = -previous;
  if (std::signbit(total) != std::signbit(negative_previous)) {
    return (total + negative_previous) + value;
  }
  if (std::signbit(total) != std::signbit(value)) {
    return (total + value) + negative_previous;
  }
  return (negative_previous + value) + total;
}

void OtelMetrics::AssertThread() const {
  DCHECK(utils::are_threads_equal(uv_thread_self(), thread_id_));
}

int OtelMetrics::RegisterInstrument(std::string meter_name,
                                    std::string meter_version,
                                    std::string meter_schema_url,
                                    std::string name,
                                    std::string unit,
                                    std::string description,
                                    uint32_t* instrument_id,
                                    OtelMetricType type,
                                    std::optional<std::vector<double>>
                                        histogram_boundaries) {
  AssertThread();
  if (instrument_id == nullptr) {
    return UV_EINVAL;
  }
  if (instruments_.size() >= UINT32_MAX) {
    return UV_E2BIG;
  }

  *instrument_id = static_cast<uint32_t>(instruments_.size());
  auto metadata = std::make_shared<const OtelInstrumentMetadata>(
      OtelInstrumentMetadata{ std::move(meter_name),
                              std::move(meter_version),
                              std::move(meter_schema_url),
                              std::move(name),
                              std::move(unit),
                              std::move(description),
                              type,
                              std::chrono::system_clock::now() });
  instruments_.push_back({ std::move(metadata),
                           std::move(histogram_boundaries),
                           {},
                           {},
                           {} });
  return 0;
}

int OtelMetrics::AddInstrument(uint32_t instrument_id,
                               double value,
                               std::string attributes) {
  AssertThread();
  const OtelMetricType type = instrument_id < instruments_.size() ?
      instruments_[instrument_id].metadata->type :
      OtelMetricType::kCounter;
  if (instrument_id >= instruments_.size() || !std::isfinite(value) ||
      ((type == OtelMetricType::kCounter ||
        type == OtelMetricType::kObservableCounter) && value < 0)) {
    return UV_EINVAL;
  }

  const auto normalized = normalized_attributes_.find(attributes);
  if (normalized != normalized_attributes_.end()) {
    attributes = normalized->second;
  } else {
    nlohmann::json parsed = nlohmann::json::parse(attributes, nullptr, false);
    if (!parsed.is_object()) {
      return UV_EINVAL;
    }

    for (const auto& [key, attribute] : parsed.items()) {
      USE(key);
      if (attribute.is_primitive() && !attribute.is_null()) {
        continue;
      }
      if (!attribute.is_array()) {
        return UV_EINVAL;
      }
      int type = -1;
      for (const auto& element : attribute) {
        if (!element.is_primitive() || element.is_null()) {
          return UV_EINVAL;
        }
        const int element_type = element.is_boolean() ? 0 :
            element.is_string() ? 1 : element.is_number() ? 2 : -1;
        if (element_type < 0 || (type >= 0 && type != element_type)) {
          return UV_EINVAL;
        }
        type = element_type;
      }
    }

    const std::string canonical = parsed.dump();
    if (normalized_attributes_.size() < kMaxAttributeSets) {
      normalized_attributes_.emplace(std::move(attributes), canonical);
    }
    attributes = canonical;
  }
  const std::string original_attributes = attributes;
  Instrument& instrument = instruments_[instrument_id];
  const bool observable_sum =
      type == OtelMetricType::kObservableCounter ||
      type == OtelMetricType::kObservableUpDownCounter;
  if (observable_sum) {
    auto observed = instrument.overflow_observations.find(original_attributes);
    if (observed != instrument.overflow_observations.end()) {
      const auto overflow = instrument.value_indices.find(
          kOtelMetricOverflowAttributes);
      if (overflow != instrument.value_indices.end()) {
        auto& point = instrument.values[overflow->second];
        const double total = replace_observation_value(
            point.value, observed->second, value);
        if (!std::isfinite(total)) {
          return UV_EINVAL;
        }
        point.value = total;
        observed->second = value;
        return 0;
      }
    }
  }
  // Avoid hashing for the common single-set instrument.
  auto it = instrument.values.begin();
  if (it == instrument.values.end() || it->attributes != original_attributes) {
    const auto index = instrument.value_indices.find(original_attributes);
    it = index == instrument.value_indices.end() ? instrument.values.end() :
        instrument.values.begin() + index->second;
  }
  bool overflow = false;
  if (it == instrument.values.end()) {
    if (instrument.values.size() >= kMaxAttributeSets - 1) {
      overflow = true;
      attributes = kOtelMetricOverflowAttributes;
      const auto index = instrument.value_indices.find(attributes);
      if (index != instrument.value_indices.end()) {
        it = instrument.values.begin() + index->second;
      }
    }
    if (it == instrument.values.end()) {
      Instrument::Value new_value;
      new_value.attributes = std::move(attributes);
      if (type == OtelMetricType::kHistogram) {
        if (!instrument.histogram_boundaries.has_value()) {
          new_value.histogram = std::make_unique<DoubleHistogramAggregation>();
        } else {
          HistogramAggregationConfig config;
          config.boundaries_ = *instrument.histogram_boundaries;
          new_value.histogram =
              std::make_unique<DoubleHistogramAggregation>(&config);
        }
        new_value.histogram->Aggregate(value);
        new_value.value = value;
        new_value.histogram_count = 1;
      } else {
        new_value.value = value;
      }
      instrument.value_indices.emplace(new_value.attributes,
                                       instrument.values.size());
      instrument.values.push_back(std::move(new_value));
      if (overflow && observable_sum) {
        instrument.overflow_observations.emplace(original_attributes, value);
      }
      return 0;
    }
  }

  if (type == OtelMetricType::kGauge ||
      type == OtelMetricType::kObservableGauge ||
      ((type == OtelMetricType::kObservableCounter ||
        type == OtelMetricType::kObservableUpDownCounter) && !overflow)) {
    it->value = value;
    return 0;
  }

  if (type == OtelMetricType::kHistogram) {
    const double sum = it->value + value;
    // A bucket cannot overflow before the total accepted sample count.
    if (!std::isfinite(sum) || it->histogram_count == UINT64_MAX) {
      return UV_EINVAL;
    }
    it->histogram->Aggregate(value);
    it->value = sum;
    it->histogram_count++;
    return 0;
  }
  if (!std::isfinite(it->value + value)) {
    return UV_EINVAL;
  }
  it->value += value;
  if (overflow && observable_sum) {
    instrument.overflow_observations.emplace(original_attributes, value);
  }
  return 0;
}

const OtelMetrics::InstrumentsStor& OtelMetrics::Get() const {
  AssertThread();
  return instruments_;
}

void OtelMetrics::ClearObservableValues() {
  AssertThread();
  for (auto& instrument : instruments_) {
    const OtelMetricType type = instrument.metadata->type;
    if (type == OtelMetricType::kObservableCounter ||
        type == OtelMetricType::kObservableGauge ||
        type == OtelMetricType::kObservableUpDownCounter) {
      instrument.values.clear();
      instrument.value_indices.clear();
      std::unordered_map<std::string, double>().swap(
          instrument.overflow_observations);
    }
  }
}

void OtelMetrics::Disable() {
  AssertThread();
  instruments_.clear();
  normalized_attributes_.clear();
}

}  // namespace nsolid
}  // namespace node
