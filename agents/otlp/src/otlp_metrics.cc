// This header needs to be included before any other grpc header otherwise there
// will be a compilation error because of abseil.
// Refs: https://github.com/open-telemetry/opentelemetry-cpp/blob/32cd66b62333e84aa8e92a4447e0aa667b6735e5/examples/otlp/README.md#additional-notes-regarding-abseil-library
#include "opentelemetry/exporters/otlp/otlp_grpc_metric_exporter.h"
#include "otlp_metrics.h"
#include "debug_utils-inl.h"
#include "env-inl.h"
#include "otlp_agent.h"
#include "opentelemetry/exporters/otlp/otlp_http_metric_exporter.h"
#include "opentelemetry/trace/semantic_conventions.h"
#include "opentelemetry/sdk/metrics/data/metric_data.h"
#include "opentelemetry/sdk/metrics/export/metric_producer.h"

#include <algorithm>

#include "asserts-cpp/asserts.h"

using ProcessMetricsStor = node::nsolid::ProcessMetrics::MetricsStor;
using ThreadMetricsStor = node::nsolid::ThreadMetrics::MetricsStor;
using std::chrono::duration_cast;
using time_point = std::chrono::system_clock::time_point;
using std::chrono::microseconds;
using std::chrono::milliseconds;

using opentelemetry::exporter::otlp::HttpRequestContentType;
using opentelemetry::sdk::metrics::AggregationTemporality;
using opentelemetry::sdk::metrics::MetricData;
using opentelemetry::sdk::metrics::InstrumentDescriptor;
using opentelemetry::sdk::metrics::InstrumentType;
using opentelemetry::sdk::metrics::InstrumentValueType;
using opentelemetry::sdk::metrics::PointAttributes;
using opentelemetry::sdk::metrics::PointDataAttributes;
using opentelemetry::sdk::metrics::ResourceMetrics;
using opentelemetry::sdk::metrics::ScopeMetrics;
using opentelemetry::sdk::metrics::SumPointData;
using opentelemetry::sdk::metrics::ValueType;
using opentelemetry::v1::exporter::otlp::OtlpGrpcMetricExporter;
using opentelemetry::v1::exporter::otlp::OtlpGrpcMetricExporterOptions;
using opentelemetry::v1::exporter::otlp::OtlpHttpMetricExporter;
using opentelemetry::v1::exporter::otlp::OtlpHttpMetricExporterOptions;
using opentelemetry::v1::trace::SemanticConventions::kThreadId;

namespace node {
namespace nsolid {
namespace otlp {

template <typename... Args>
inline void Debug(Args&&... args) {
  per_process::Debug(DebugCategory::NSOLID_OTLP_AGENT,
                     std::forward<Args>(args)...);
}

static std::vector<std::string> discarded_metrics = {
  "thread_id", "timestamp"
};

OTLPMetrics::OTLPMetrics(uv_loop_t* loop,
                         const std::string& url,
                         const std::string& key,
                         bool is_http,
                         const OTLPAgent& agent):
    key_(key),
    url_(url),
    start_(duration_cast<time_point::duration>(
              microseconds(static_cast<uint64_t>(
                  performance::performance_process_start_timestamp)))),
    agent_(agent) {
  if (is_http) {
    OtlpHttpMetricExporterOptions opts;
    opts.url = url + "/v1/metrics";
    opts.content_type = HttpRequestContentType::kBinary;
    opts.console_debug = true;
    otlp_metric_exporter_ = std::make_unique<OtlpHttpMetricExporter>(opts);
  } else {
    OtlpGrpcMetricExporterOptions opts;
    opts.endpoint = url + "/v1/metrics";
    otlp_metric_exporter_ = std::make_unique<OtlpGrpcMetricExporter>(opts);
  }
}

/*virtual*/
OTLPMetrics::~OTLPMetrics() {
}

// NOLINTNEXTLINE(runtime/references)
static void add_counter(std::vector<MetricData>& metrics,
                        const time_point& start,
                        const time_point& end,
                        const char* name,
                        const char* unit,
                        InstrumentValueType type,
                        ValueType value,
                        PointAttributes attrs = {}) {
  SumPointData sum_point_data{ value };
  MetricData metric_data{
    InstrumentDescriptor{ name, "", unit, InstrumentType::kCounter, type},
    AggregationTemporality::kCumulative,
    opentelemetry::common::SystemTimestamp{ start },
    opentelemetry::common::SystemTimestamp{ end },
    std::vector<PointDataAttributes>{{ attrs, sum_point_data }}
  };
  metrics.push_back(metric_data);
}

// NOLINTNEXTLINE(runtime/references)
static void add_gauge(std::vector<MetricData>& metrics,
                      const time_point& start,
                      const time_point& end,
                      const char* name,
                      const char* unit,
                      InstrumentValueType type,
                      ValueType value,
                      PointAttributes attrs = {}) {
  opentelemetry::sdk::metrics::LastValuePointData lv_point_data{ value };
  MetricData metric_data{
    InstrumentDescriptor{
      name, "", unit, InstrumentType::kObservableGauge, type },
    AggregationTemporality::kCumulative,
    opentelemetry::common::SystemTimestamp{ start },
    opentelemetry::common::SystemTimestamp{ end },
    std::vector<PointDataAttributes>{{ attrs, lv_point_data }}
  };
  metrics.push_back(metric_data);
}

/*virtual*/
void OTLPMetrics::got_proc_metrics(const ProcessMetricsStor& stor,
                                   const ProcessMetricsStor& prev_stor) {
  ResourceMetrics data;
  data.resource_ = &agent_.resource_;
  std::vector<MetricData> metrics;

  time_point end{
        duration_cast<time_point::duration>(
          milliseconds(static_cast<uint64_t>(stor.timestamp)))};

  InstrumentValueType type;
  ValueType value;

  #define V(CType, CName, JSName, MType, Unit)                                 \
{                                                                              \
  auto it = std::find(discarded_metrics.begin(),                               \
                      discarded_metrics.end(),                                 \
                      #CName);                                                 \
  if (it == discarded_metrics.end()) {                                         \
    if constexpr (std::is_same_v<CType, double>) {                             \
      type = InstrumentValueType::kDouble;                                     \
      value = static_cast<double>(stor.CName);                                 \
    } else if constexpr (std::is_same_v<CType, uint64_t>) {                    \
      if (stor.CName > std::numeric_limits<int64_t>::max()) {                  \
        type = InstrumentValueType::kDouble;                                   \
        value = static_cast<double>(stor.CName);                               \
      } else {                                                                 \
        type = InstrumentValueType::kInt;                                      \
        value = static_cast<int64_t>(stor.CName);                              \
      }                                                                        \
    }                                                                          \
    switch (MetricsType::MType) {                                              \
      case MetricsType::ECounter:                                              \
      {                                                                        \
        add_counter(metrics, start_, end, #CName, Unit, type, value);          \
      }                                                                        \
      break;                                                                   \
      case MetricsType::EGauge:                                                \
      {                                                                        \
        add_gauge(metrics, start_, end, #CName, Unit, type, value);            \
      }                                                                        \
      break;                                                                   \
      default:                                                                 \
      break;                                                                   \
    }                                                                          \
  }                                                                            \
}
NSOLID_PROCESS_METRICS_UINT64(V)
NSOLID_PROCESS_METRICS_DOUBLE(V)
#undef V

  data.scope_metric_data_ =
    std::vector<ScopeMetrics>{{agent_.scope_.get(), metrics}};
  auto result = otlp_metric_exporter_->Export(data);
  Debug("# ProcessMetrics Exported. Result: %d\n", static_cast<int>(result));
}

// NOLINTNEXTLINE(runtime/references)
static void got_env_metrics(std::vector<MetricData>& metrics,
                            const ThreadMetricsStor& stor,
                            const ThreadMetricsStor& prev_stor,
                            time_point start) {
  time_point end{
        duration_cast<time_point::duration>(
          milliseconds(static_cast<uint64_t>(stor.timestamp)))};

  InstrumentValueType type;
  ValueType value;

  PointAttributes attrs = {
    { kThreadId, static_cast<int64_t>(stor.thread_id) }
  };

#define V(CType, CName, JSName, MType, Unit)                                   \
{                                                                              \
  auto it = std::find(discarded_metrics.begin(),                               \
                      discarded_metrics.end(),                                 \
                      #CName);                                                 \
  if (it == discarded_metrics.end()) {                                         \
    if constexpr (std::is_same_v<CType, double>) {                             \
      type = InstrumentValueType::kDouble;                                     \
      value = static_cast<double>(stor.CName);                                 \
    } else if constexpr (std::is_same_v<CType, uint64_t>) {                    \
      if (stor.CName > std::numeric_limits<int64_t>::max()) {                  \
        type = InstrumentValueType::kDouble;                                   \
        value = static_cast<double>(stor.CName);                               \
      } else {                                                                 \
        type = InstrumentValueType::kInt;                                      \
        value = static_cast<int64_t>(stor.CName);                              \
      }                                                                        \
    }                                                                          \
    switch (MetricsType::MType) {                                              \
      case MetricsType::ECounter:                                              \
      {                                                                        \
        add_counter(metrics, start, end, #CName, Unit, type, value, attrs);    \
      }                                                                        \
      break;                                                                   \
      case MetricsType::EGauge:                                                \
      {                                                                        \
        add_gauge(metrics, start, end, #CName, Unit, type, value, attrs);      \
      }                                                                        \
      break;                                                                   \
      default:                                                                 \
      break;                                                                   \
    }                                                                          \
  }                                                                            \
}
NSOLID_ENV_METRICS_NUMBERS(V)
#undef V
}

/*virtual*/
void OTLPMetrics::got_thr_metrics(
    const std::vector<MetricsExporter::ThrMetricsStor>& thr_metrics) {
  ResourceMetrics data;
  data.resource_ = &agent_.resource_;
  std::vector<MetricData> metrics;

  for (const auto& tm : thr_metrics) {
    got_env_metrics(metrics, tm.stor, tm.prev_stor, start_);
  }

  data.scope_metric_data_ =
    std::vector<ScopeMetrics>{{agent_.scope_.get(), metrics}};
  auto result = otlp_metric_exporter_->Export(data);
  Debug("# ThreadMetrics Exported. Result: %d\n", static_cast<int>(result));
}
}  // namespace otlp
}  // namespace nsolid
}  // namespace node
