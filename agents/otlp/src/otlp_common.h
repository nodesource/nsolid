#ifndef AGENTS_OTLP_SRC_OTLP_COMMON_H_
#define AGENTS_OTLP_SRC_OTLP_COMMON_H_

#include <cstddef>
#include <string>
#include <unordered_map>
#include <vector>

#include "nsolid.h"
#include "opentelemetry/sdk/metrics/data/metric_data.h"
#include "opentelemetry/sdk/resource/resource.h"

// Class pre-declaration
OPENTELEMETRY_BEGIN_NAMESPACE
namespace sdk {
namespace instrumentationscope {
class InstrumentationScope;
}  // namespace instrumentationscope
namespace resource {
class Resource;
}  // namespace resource
namespace trace {
class Recordable;
}  // namespace trace
}  // namespace sdk
OPENTELEMETRY_END_NAMESPACE

// Class pre-declaration
OPENTELEMETRY_BEGIN_NAMESPACE
namespace sdk {
namespace instrumentationscope {
class InstrumentationScope;
}
namespace logs {
class Recordable;
}
namespace trace {
class Recordable;
}
}  // namespace sdk
OPENTELEMETRY_END_NAMESPACE

namespace node {
namespace nsolid {
namespace otlp {

class MetricDataBatch {
  using MetricVector = std::vector<opentelemetry::sdk::metrics::MetricData>;
  using MetricIndexMap = std::unordered_map<std::string, std::size_t>;

 public:
  explicit MetricDataBatch(std::size_t limit = 1);

  ~MetricDataBatch() = default;

  void AddDataPoint(const std::chrono::system_clock::time_point& start,
                    const std::chrono::system_clock::time_point& end,
                    const char* name,
                    const char* unit,
                    opentelemetry::sdk::metrics::InstrumentType type,
                    opentelemetry::sdk::metrics::InstrumentValueType value_type,
                    opentelemetry::sdk::metrics::AggregationTemporality temp,
                    opentelemetry::sdk::metrics::PointDataAttributes&& data);

  MetricVector DumpMetricsAndReset() {
    MetricVector metrics = std::move(metrics_);
    Reset();
    return metrics;
  };

  void IncrementPoints(std::size_t count = 1) {
    total_points_ += count;
  }

  bool ShouldFlush() const {
    return max_points_ > 0 && total_points_ >= max_points_;
  }

  void Reset() {
    metrics_.clear();
    metric_indices_.clear();
    total_points_ = 0;
  }

  void Resize(std::size_t limit) {
    max_points_ = limit;
  }

 private:
  MetricDataBatch(const MetricDataBatch&) = delete;
  MetricDataBatch& operator=(const MetricDataBatch&) = delete;

  void TrackMetricIndex(std::string key, std::size_t index) {
    metric_indices_[std::move(key)] = index;
  }

  MetricVector metrics_;
  MetricIndexMap metric_indices_;

  std::size_t total_points_ = 0;
  std::size_t max_points_ = 0;
};

OPENTELEMETRY_NAMESPACE::sdk::instrumentationscope::InstrumentationScope*
    GetScope();

OPENTELEMETRY_NAMESPACE::sdk::resource::Resource* GetResource();

OPENTELEMETRY_NAMESPACE::sdk::resource::Resource* UpdateResource(
    OPENTELEMETRY_NAMESPACE::sdk::resource::ResourceAttributes&&);

// NOLINTNEXTLINE(runtime/references)
void fill_proc_metrics(MetricDataBatch& metrics_batch,
                       const ProcessMetrics::MetricsStor& stor,
                       const ProcessMetrics::MetricsStor& prev_stor,
                       bool use_snake_case = true);

// NOLINTNEXTLINE(runtime/references)
void fill_env_metrics(MetricDataBatch& metrics_batch,
                      const ThreadMetrics::MetricsStor& stor,
                      bool use_snake_case = true);

void fill_log_recordable(OPENTELEMETRY_NAMESPACE::sdk::logs::Recordable*,
                         const LogWriteInfo&);

void fill_recordable(OPENTELEMETRY_NAMESPACE::sdk::trace::Recordable*,
                     const Tracer::SpanStor&);


}  // namespace otlp
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_OTLP_SRC_OTLP_COMMON_H_
