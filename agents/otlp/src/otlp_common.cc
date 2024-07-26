#include "otlp_common.h"
// NOLINTNEXTLINE(build/c++11)
#include <chrono>
#include "asserts-cpp/asserts.h"
#include "env-inl.h"
#include "nlohmann/json.hpp"
#include "opentelemetry/sdk/instrumentationscope/instrumentation_scope.h"
#include "opentelemetry/sdk/logs/recordable.h"
#include "opentelemetry/sdk/resource/resource.h"
#include "opentelemetry/sdk/resource/semantic_conventions.h"
#include "opentelemetry/sdk/trace/recordable.h"
#include "opentelemetry/trace/propagation/detail/hex.h"
#include "opentelemetry/trace/semantic_conventions.h"

using nlohmann::json;

using ProcessMetricsStor = node::nsolid::ProcessMetrics::MetricsStor;
using ThreadMetricsStor = node::nsolid::ThreadMetrics::MetricsStor;
using std::chrono::duration_cast;
using time_point = std::chrono::system_clock::time_point;
using std::chrono::microseconds;
using std::chrono::milliseconds;
using std::chrono::nanoseconds;

using opentelemetry::common::SystemTimestamp;
using opentelemetry::sdk::instrumentationscope::InstrumentationScope;
using LogsRecordable = opentelemetry::sdk::logs::Recordable;
using opentelemetry::sdk::metrics::AggregationTemporality;
using opentelemetry::sdk::metrics::MetricData;
using opentelemetry::sdk::metrics::InstrumentDescriptor;
using opentelemetry::sdk::metrics::InstrumentType;
using opentelemetry::sdk::metrics::InstrumentValueType;
using opentelemetry::sdk::metrics::PointAttributes;
using opentelemetry::sdk::metrics::PointDataAttributes;
using opentelemetry::sdk::metrics::SumPointData;
using opentelemetry::sdk::metrics::ValueType;
using opentelemetry::sdk::resource::Resource;
using opentelemetry::sdk::resource::ResourceAttributes;
using opentelemetry::sdk::resource::SemanticConventions::kServiceName;
using opentelemetry::sdk::resource::SemanticConventions::kServiceInstanceId;
using opentelemetry::sdk::resource::SemanticConventions::kServiceVersion;
using opentelemetry::sdk::trace::Recordable;
using opentelemetry::trace::SpanContext;
using opentelemetry::trace::SpanId;
using opentelemetry::trace::SpanKind;
using opentelemetry::trace::TraceFlags;
using opentelemetry::trace::TraceId;
using opentelemetry::trace::propagation::detail::HexToBinary;
using opentelemetry::v1::trace::SemanticConventions::kThreadId;

namespace node {
namespace nsolid {
namespace otlp {

static const size_t kTraceIdSize             = 32;
static const size_t kSpanIdSize              = 16;

static time_point process_start(duration_cast<time_point::duration>(
    microseconds(static_cast<uint64_t>(
        performance::performance_process_start_timestamp))));

static std::vector<std::string> discarded_metrics = {
  "thread_id", "timestamp"
};

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
    SystemTimestamp{ start },
    SystemTimestamp{ end },
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
    SystemTimestamp{ start },
    SystemTimestamp{ end },
    std::vector<PointDataAttributes>{{ attrs, lv_point_data }}
  };
  metrics.push_back(metric_data);
}

InstrumentationScope* GetScope() {
  static std::unique_ptr<InstrumentationScope> scope =
    InstrumentationScope::Create("nsolid", NODE_VERSION "+ns" NSOLID_VERSION);
  return scope.get();
}

Resource* GetResource() {
  static bool isResourceInitialized = false;
  static auto resource = std::make_unique<Resource>(Resource::GetEmpty());
  if (!isResourceInitialized) {
    json config = json::parse(nsolid::GetConfig(), nullptr, false);
    // assert because the runtime should never send me an invalid JSON config
    ASSERT(!config.is_discarded());
    auto it = config.find("app");
    ASSERT(it != config.end());
    ResourceAttributes attrs({
      {kServiceName, it->get<std::string>()},
      {kServiceInstanceId, nsolid::GetAgentId()}
    });

    it = config.find("appVersion");
    if (it != config.end()) {
      attrs.SetAttribute(kServiceVersion, it->get<std::string>());
    }

    // Directly construct a new Resource in the unique_ptr
    resource = std::make_unique<Resource>(Resource::Create(attrs));
    isResourceInitialized = true;
  }

  return resource.get();
}

// NOLINTNEXTLINE(runtime/references)
void fill_proc_metrics(std::vector<MetricData>& metrics,
                       const ProcessMetrics::MetricsStor& stor) {
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
        add_counter(metrics,                                                   \
                    process_start,                                             \
                    end,                                                       \
                    #JSName,                                                   \
                    Unit,                                                      \
                    type,                                                      \
                    value);                                                    \
      }                                                                        \
      break;                                                                   \
      case MetricsType::EGauge:                                                \
      {                                                                        \
        add_gauge(metrics, process_start, end, #JSName, Unit, type, value);    \
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
}

// NOLINTNEXTLINE(runtime/references)
void fill_env_metrics(std::vector<MetricData>& metrics,
                      const ThreadMetrics::MetricsStor& stor) {
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
        add_counter(metrics,                                                   \
                    process_start,                                             \
                    end,                                                       \
                    #JSName,                                                    \
                    Unit,                                                      \
                    type,                                                      \
                    value,                                                     \
                    attrs);                                                    \
      }                                                                        \
      break;                                                                   \
      case MetricsType::EGauge:                                                \
      {                                                                        \
        add_gauge(metrics,                                                     \
                  process_start,                                               \
                  end,                                                         \
                  #JSName,                                                      \
                  Unit,                                                        \
                  type,                                                        \
                  value,                                                       \
                  attrs);                                                      \
      }                                                                        \
      default:                                                                 \
      break;                                                                   \
    }                                                                          \
  }                                                                            \
}
NSOLID_ENV_METRICS_NUMBERS(V)
#undef V
}

void fill_log_recordable(LogsRecordable* recordable,
                         const LogWriteInfo& info) {
  recordable->SetBody(info.msg);
  recordable->SetSeverity(static_cast<opentelemetry::logs::Severity>(info.severity));
  SystemTimestamp ts(duration_cast<time_point::duration>(
    milliseconds(static_cast<uint64_t>(info.timestamp))));
  recordable->SetTimestamp(ts);
  recordable->SetObservedTimestamp(ts);
  recordable->SetResource(*GetResource());
  recordable->SetInstrumentationScope(*GetScope());
}

void fill_recordable(Recordable* recordable, const Tracer::SpanStor& s) {
  recordable->SetName(s.name);
  time_point start{
      duration_cast<time_point::duration>(
        milliseconds(static_cast<uint64_t>(s.start)))};
  recordable->SetStartTime(start);
  recordable->SetDuration(
    nanoseconds(static_cast<uint64_t>((s.end - s.start) * 1e6)));

  uint8_t span_buf[kSpanIdSize / 2];
  HexToBinary(s.span_id, span_buf, sizeof(span_buf));

  uint8_t parent_buf[kSpanIdSize / 2];
  HexToBinary(s.parent_id, parent_buf, sizeof(parent_buf));

  uint8_t trace_buf[kTraceIdSize / 2];
  HexToBinary(s.trace_id, trace_buf, sizeof(trace_buf));

  SpanContext ctx(TraceId(trace_buf), SpanId(span_buf), TraceFlags(0), false);

  SpanId parent_id(parent_buf);

  recordable->SetIdentity(ctx, parent_id);

  recordable->SetSpanKind(static_cast<SpanKind>(s.kind));

  json attrs = json::parse(s.attrs);
  ASSERT(!attrs.is_discarded());
  for (const auto& attr : attrs.items()) {
    const json val = attr.value();
    if (val.is_boolean())
      recordable->SetAttribute(attr.key(), attr.value().get<bool>());
    else if (val.is_number_integer())
      recordable->SetAttribute(attr.key(), attr.value().get<int64_t>());
    else if (val.is_number_unsigned())
      recordable->SetAttribute(attr.key(), attr.value().get<uint64_t>());
    else if (val.is_number_float())
      recordable->SetAttribute(attr.key(), attr.value().get<double>());
    else if (val.is_string())
      recordable->SetAttribute(attr.key(), attr.value().get<std::string>());
  }

  recordable->SetAttribute("thread.id", s.thread_id);

  recordable->SetResource(*GetResource());
}

}  // namespace otlp
}  // namespace nsolid
}  // namespace node
