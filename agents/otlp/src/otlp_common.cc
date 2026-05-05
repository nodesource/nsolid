#include "otlp_common.h"
// NOLINTNEXTLINE(build/c++11)
#include <algorithm>
// NOLINTNEXTLINE(build/c++11)
#include <chrono>
#include <climits>
#include <unordered_map>
#include "asserts-cpp/asserts.h"
#include "env-inl.h"
#include "nsolid/nsolid_util.h"
#include "nlohmann/json.hpp"
#include "opentelemetry/semconv/incubating/process_attributes.h"
#include "opentelemetry/exporters/otlp/otlp_populate_attribute_utils.h"
#include "opentelemetry/semconv/incubating/thread_attributes.h"
#include "opentelemetry/semconv/incubating/service_attributes.h"
#include "opentelemetry/sdk/instrumentationscope/instrumentation_scope.h"
#include "opentelemetry/sdk/logs/recordable.h"
#include "opentelemetry/sdk/trace/recordable.h"
#include "opentelemetry/trace/propagation/detail/hex.h"

using nlohmann::json;

using ProcessMetricsStor = node::nsolid::ProcessMetrics::MetricsStor;
using ThreadMetricsStor = node::nsolid::ThreadMetrics::MetricsStor;
using std::chrono::duration_cast;
using time_point = std::chrono::system_clock::time_point;
using std::chrono::microseconds;
using std::chrono::milliseconds;
using std::chrono::nanoseconds;

using google::protobuf::RepeatedPtrField;
using opentelemetry::common::SystemTimestamp;
using opentelemetry::proto::common::v1::KeyValue;
using opentelemetry::proto::collector::metrics::v1::ExportMetricsServiceRequest;
using opentelemetry::sdk::instrumentationscope::InstrumentationScope;
using LogsRecordable = opentelemetry::sdk::logs::Recordable;
using opentelemetry::sdk::common::OwnedAttributeType;
using opentelemetry::sdk::metrics::AggregationTemporality;
using opentelemetry::sdk::metrics::InstrumentDescriptor;
using opentelemetry::sdk::metrics::InstrumentType;
using opentelemetry::sdk::metrics::InstrumentValueType;
using opentelemetry::sdk::metrics::LastValuePointData;
using opentelemetry::sdk::metrics::PointAttributes;
using opentelemetry::sdk::metrics::PointDataAttributes;
using opentelemetry::sdk::metrics::SummaryPointData;
using opentelemetry::sdk::metrics::SumPointData;
using opentelemetry::sdk::metrics::ValueType;
using opentelemetry::sdk::resource::Resource;
using opentelemetry::sdk::resource::ResourceAttributes;
using opentelemetry::sdk::trace::Recordable;
using OtlpPopulateAttributeUtils =
    opentelemetry::exporter::otlp::OtlpPopulateAttributeUtils;

namespace proto = opentelemetry::proto;

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

static auto resource_g = std::make_unique<Resource>(Resource::GetEmpty());
static bool isResourceInitialized_g = false;

// Helper to serialize attributes
void SerializeAttributes(const PointAttributes& attrs,
                         RepeatedPtrField<KeyValue>* proto_attrs) {
  for (const auto& attr : attrs) {
    OtlpPopulateAttributeUtils::PopulateAttribute(
        proto_attrs->Add(), attr.first, attr.second, false);
  }
}

opentelemetry::sdk::metrics::MetricData BatchedMetricToMetricData(
    const BatchedMetricData& bm) {
  opentelemetry::sdk::metrics::MetricData md;
  md.instrument_descriptor = bm.instrument_descriptor;
  md.aggregation_temporality = bm.aggregation_temporality;
  if (!bm.point_data_attr_.empty()) {
    md.start_ts = bm.point_data_attr_[0].start_ts;
    md.end_ts = bm.point_data_attr_[0].end_ts;
    for (const auto& p : bm.point_data_attr_) {
      md.point_data_attr_.push_back({ p.attributes, p.point_data });
    }
  }
  return md;
}

// Helper to convert vector<BatchedMetricData> to vector<MetricData>
std::vector<opentelemetry::sdk::metrics::MetricData>
    ConvertBatchedToMetricData(const std::vector<BatchedMetricData>& batched) {
  std::vector<opentelemetry::sdk::metrics::MetricData> metric_data;
  metric_data.reserve(batched.size());
  for (const auto& bm : batched) {
    metric_data.push_back(BatchedMetricToMetricData(bm));
  }
  return metric_data;
}

// NOLINTNEXTLINE(runtime/references)
static void add_counter(MetricDataBatch& metrics_batch,
                        const time_point& start,
                        const time_point& end,
                        const char* name,
                        const char* unit,
                        InstrumentValueType value_type,
                        ValueType value,
                        PointAttributes attrs = {}) {
  SumPointData sum_point_data;
  sum_point_data.value_ = value;
  PointDataAttributes point_data_attributes { attrs, sum_point_data };
  metrics_batch.AddDataPoint(start,
                             end,
                             name,
                             unit,
                             InstrumentType::kCounter,
                             value_type,
                             AggregationTemporality::kCumulative,
                             std::move(point_data_attributes));
}

// NOLINTNEXTLINE(runtime/references)
static void add_gauge(MetricDataBatch& metrics_batch,
                      const time_point& start,
                      const time_point& end,
                      const char* name,
                      const char* unit,
                      InstrumentValueType value_type,
                      ValueType value,
                      PointAttributes attrs = {}) {
  LastValuePointData lv_point_data;
  lv_point_data.value_ = value;
  PointDataAttributes point_data_attributes { attrs, lv_point_data };
  metrics_batch.AddDataPoint(start,
                             end,
                             name,
                             unit,
                             InstrumentType::kGauge,
                             value_type,
                             AggregationTemporality::kCumulative,
                             std::move(point_data_attributes));
}

// NOLINTNEXTLINE(runtime/references)
static void add_summary(MetricDataBatch& metrics_batch,
                        const time_point& start,
                        const time_point& end,
                        const char* name,
                        const char* unit,
                        InstrumentValueType value_type,
                        std::unordered_map<double, ValueType>&& values,
                        PointAttributes attrs = {}) {
  SummaryPointData summary_point_data{};
  summary_point_data.quantile_values_ = std::move(values);
  PointDataAttributes point_data_attributes { attrs, summary_point_data };
  metrics_batch.AddDataPoint(start,
                             end,
                             name,
                             unit,
                             InstrumentType::kSummary,
                             value_type,
                             AggregationTemporality::kUnspecified,
                             std::move(point_data_attributes));
}

MetricDataBatch::MetricDataBatch(std::size_t limit): max_points_(limit) {
}

void MetricDataBatch::AddDataPoint(const time_point& start,
                                   const time_point& end,
                                   const char* name,
                                   const char* unit,
                                   InstrumentType type,
                                   InstrumentValueType value_type,
                                   AggregationTemporality temporality,
                                   PointDataAttributes&& pdata_attrs) {
  TimedPointDataAttributes timed_point_data_attrs {
    SystemTimestamp{ start },
    SystemTimestamp{ end },
    std::move(pdata_attrs.attributes),
    std::move(pdata_attrs.point_data)
  };
  auto it = metric_indices_.find(name);
  if (it == metric_indices_.end()) {
    BatchedMetricData metric_data {
      InstrumentDescriptor { name, "", unit, type, value_type },
      temporality,
      std::vector<TimedPointDataAttributes>{std::move(timed_point_data_attrs)}
    };
    metrics_.push_back(metric_data);
    TrackMetricIndex(name, metrics_.size() - 1);
  } else {
    metrics_[it->second].point_data_attr_.
      push_back(std::move(timed_point_data_attrs));
  }
}

InstrumentationScope* GetScope() {
  static std::unique_ptr<InstrumentationScope> scope =
    InstrumentationScope::Create("nsolid", NODE_VERSION "+ns" NSOLID_VERSION);
  return scope.get();
}

Resource* GetResource() {
  if (!isResourceInitialized_g) {
    json config = json::parse(nsolid::GetConfig(), nullptr, false);
    // assert because the runtime should never send me an invalid JSON config
    ASSERT(!config.is_discarded());
    auto it = config.find("app");
    ASSERT(it != config.end());
    using opentelemetry::semconv::service::kServiceName;
    using opentelemetry::semconv::service::kServiceInstanceId;
    using opentelemetry::semconv::service::kServiceVersion;
    ResourceAttributes attrs({
      {kServiceName, it->get<std::string>()},
      {kServiceInstanceId, nsolid::GetAgentId()}
    });

    it = config.find("appVersion");
    if (it != config.end()) {
      attrs.SetAttribute(kServiceVersion, it->get<std::string>());
    }

    // Directly construct a new Resource in the unique_ptr
    resource_g = std::make_unique<Resource>(Resource::Create(attrs));
    isResourceInitialized_g = true;
  }

  return resource_g.get();
}

Resource* UpdateResource(ResourceAttributes&& attrs) {
  // First, get current kServiceName to avoid overwriting it with the default
  // value "unknown_service". (See Resource::Create() method in the SDK).
  auto resource = GetResource();
  auto attributes = resource->GetAttributes();
  using opentelemetry::semconv::service::kServiceName;
  if (attributes.find(kServiceName) != attributes.end() &&
      attrs.find(kServiceName) == attrs.end()) {
    attrs.SetAttribute(kServiceName,
        opentelemetry::nostd::get<std::string>(attributes[kServiceName]));
  }

  auto new_res = std::make_unique<Resource>(Resource::Create(attrs));
  resource_g = std::make_unique<Resource>(resource->Merge(*new_res));
  return resource_g.get();
}

// NOLINTNEXTLINE(runtime/references)
void fill_proc_metrics(MetricDataBatch& metrics_batch,
                       const ProcessMetrics::MetricsStor& stor,
                       const ProcessMetrics::MetricsStor& prev_stor,
                       bool use_snake_case) {
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
        add_counter(metrics_batch,                                             \
                    process_start,                                             \
                    end,                                                       \
                    use_snake_case ? #CName : #JSName,                         \
                    Unit,                                                      \
                    type,                                                      \
                    value);                                                    \
      }                                                                        \
      break;                                                                   \
      case MetricsType::EGauge:                                                \
      {                                                                        \
        add_gauge(metrics_batch,                                               \
                  process_start,                                               \
                  end,                                                         \
                  use_snake_case ? #CName : #JSName,                           \
                  Unit,                                                        \
                  type,                                                        \
                  value);                                                      \
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

  metrics_batch.IncrementPoints();

  // Update Resource if needed:
  // Check if 'user' or 'title' are different from the previous metrics.
  if (prev_stor.user != stor.user || prev_stor.title != stor.title) {
    using opentelemetry::semconv::process::kProcessOwner;
    ResourceAttributes attrs = {
      { kProcessOwner, stor.user },
      { "process.title", stor.title },
    };

    USE(UpdateResource(std::move(attrs)));
  }
}

// NOLINTNEXTLINE(runtime/references)
void fill_env_metrics(MetricDataBatch& metrics_batch,
                      const ThreadMetrics::MetricsStor& stor,
                      bool use_snake_case) {
  time_point end{
        duration_cast<time_point::duration>(
          milliseconds(static_cast<uint64_t>(stor.timestamp)))};

  InstrumentValueType type;
  ValueType value;

  using opentelemetry::semconv::thread::kThreadId;
  using opentelemetry::semconv::thread::kThreadName;
  PointAttributes attrs = {
    { kThreadId, static_cast<int64_t>(stor.thread_id) },
    { kThreadName, stor.thread_name },
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
        add_counter(metrics_batch,                                             \
                    process_start,                                             \
                    end,                                                       \
                    use_snake_case ? #CName : #JSName,                         \
                    Unit,                                                      \
                    type,                                                      \
                    value,                                                     \
                    attrs);                                                    \
      }                                                                        \
      break;                                                                   \
      case MetricsType::EGauge:                                                \
      {                                                                        \
        add_gauge(metrics_batch,                                               \
                  process_start,                                               \
                  end,                                                         \
                  use_snake_case ? #CName : #JSName,                           \
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

  // Add the summary metrics separately.
  add_summary(metrics_batch,
              process_start,
              end,
              use_snake_case ? "gc_dur_us" : "gcDurUs",
              kNSUSecs,
              InstrumentValueType::kDouble,
              {{ 0.5, stor.gc_dur_us_median },
               { 0.99, stor.gc_dur_us99_ptile }},
              attrs);
  add_summary(metrics_batch,
              process_start,
              end,
              "dns",
              kNSMSecs,
              InstrumentValueType::kDouble,
              {{ 0.5, stor.dns_median }, { 0.99, stor.dns99_ptile }},
              attrs);
  add_summary(metrics_batch,
              process_start,
              end,
              use_snake_case ? "http_client" : "httpClient",
              kNSMSecs,
              InstrumentValueType::kDouble,
              {{ 0.5, stor.http_client_median },
               { 0.99, stor.http_client99_ptile }},
              attrs);
  add_summary(metrics_batch,
              process_start,
              end,
              use_snake_case ? "http_server" : "httpServer",
              kNSMSecs,
              InstrumentValueType::kDouble,
              {{ 0.5, stor.http_server_median },
               { 0.99, stor.http_server99_ptile }},
              attrs);

  metrics_batch.IncrementPoints();
}

void fill_log_recordable(LogsRecordable* recordable,
                         const LogWriteInfo& info) {
  recordable->SetBody(info.msg);
  recordable->SetSeverity(
      static_cast<opentelemetry::logs::Severity>(info.severity));
  SystemTimestamp ts(duration_cast<time_point::duration>(
    nanoseconds(static_cast<uint64_t>(info.timestamp))));
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

  using opentelemetry::trace::propagation::detail::HexToBinary;
  uint8_t span_buf[kSpanIdSize / 2];
  HexToBinary(s.span_id, span_buf, sizeof(span_buf));

  uint8_t parent_buf[kSpanIdSize / 2];
  HexToBinary(s.parent_id, parent_buf, sizeof(parent_buf));

  uint8_t trace_buf[kTraceIdSize / 2];
  HexToBinary(s.trace_id, trace_buf, sizeof(trace_buf));

  using opentelemetry::trace::SpanContext;
  using opentelemetry::trace::SpanId;
  using opentelemetry::trace::SpanKind;
  using opentelemetry::trace::TraceFlags;
  using opentelemetry::trace::TraceId;
  SpanContext ctx(TraceId(trace_buf), SpanId(span_buf), TraceFlags(0), false);

  SpanId parent_id(parent_buf);

  recordable->SetIdentity(ctx, parent_id);

  recordable->SetSpanKind(static_cast<SpanKind>(s.kind));

  json attrs = json::parse(s.attrs);
  ASSERT(!attrs.is_discarded());
  for (const std::string& a : s.extra_attrs) {
    json attr = json::parse(a, nullptr, false);
    // a must always be a valid JSON
    ASSERT(!attr.is_discarded());
    attrs.merge_patch(attr);
  }

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
    else if (val.is_array()) {
      // Handle arrays of primitive types according to OpenTelemetry spec.
      if (val.empty()) {
        // Skip empty arrays
        continue;
      }

      // Check the type of the first element to determine array type
      const auto& first = val[0];
      if (first.is_boolean()) {
        // Array of booleans - use vector<uint8_t> for contiguous storage which
        // is required by span.
        // See https://en.cppreference.com/w/cpp/container/vector_bool
        std::vector<uint8_t> bool_vec;
        bool_vec.reserve(val.size());
        for (const auto& item : val) {
          if (!item.is_boolean()) {
            // Skip non-homogeneous arrays
            goto skip_array;
          }
          bool_vec.push_back(item.get<bool>() ? 1 : 0);
        }

        // Create a span from the vector and cast to bool*
        // This is safe because we're just reinterpreting the bits
        const auto bool_span = opentelemetry::v1::nostd::span<const bool>(
            reinterpret_cast<const bool*>(bool_vec.data()), bool_vec.size());
        recordable->SetAttribute(attr.key(), bool_span);
      } else if (first.is_number_integer()) {
        // Array of integers - use int64_t for all integer arrays
        std::vector<int64_t> ints;
        ints.reserve(val.size());
        for (const auto& item : val) {
          if (!item.is_number_integer()) {
            // Skip non-homogeneous arrays
            goto skip_array;
          }
          ints.push_back(item.get<int64_t>());
        }
        recordable->SetAttribute(attr.key(), ints);
      } else if (first.is_number_unsigned()) {
        // Array of unsigned integers - use uint64_t for all unsigned integer
        // arrays.
        std::vector<uint64_t> uints;
        uints.reserve(val.size());
        for (const auto& item : val) {
          if (!item.is_number_unsigned()) {
            // Skip non-homogeneous arrays
            goto skip_array;
          }
          uints.push_back(item.get<uint64_t>());
        }
        recordable->SetAttribute(attr.key(), uints);
      } else if (first.is_number_float()) {
        // Array of doubles
        std::vector<double> doubles;
        doubles.reserve(val.size());
        for (const auto& item : val) {
          if (!item.is_number_float()) {
            // Skip non-homogeneous arrays
            goto skip_array;
          }
          doubles.push_back(item.get<double>());
        }
        recordable->SetAttribute(attr.key(), doubles);
      } else if (first.is_string()) {
        // Array of strings
        std::vector<opentelemetry::v1::nostd::string_view> string_views;
        string_views.reserve(val.size());
        for (const auto& item : val) {
          if (!item.is_string()) {
            // Skip non-homogeneous arrays
            goto skip_array;
          }

          string_views.push_back(item.get_ref<const std::string&>());
        }

        recordable->SetAttribute(attr.key(), string_views);
      }
      skip_array: {};
    }
  }

  recordable->SetAttribute("thread.id", s.thread_id);
  recordable->SetAttribute("nsolid.span_type", s.type);

  recordable->SetResource(*GetResource());
}

void PopulateRequest(const std::vector<BatchedMetricData>& metrics,
                     const Resource* resource,
                     const InstrumentationScope* scope,
                     ExportMetricsServiceRequest* request) {
  if (!request) return;

  auto* resource_metrics = request->add_resource_metrics();

  // Populate resource
  if (resource) {
    OtlpPopulateAttributeUtils::PopulateAttribute(
      resource_metrics->mutable_resource(), *resource);
    resource_metrics->set_schema_url(resource->GetSchemaURL());
  }

  // Scope
  auto* scope_metrics = resource_metrics->add_scope_metrics();
  if (scope) {
    auto* proto_scope = scope_metrics->mutable_scope();
    proto_scope->set_name(scope->GetName());
    proto_scope->set_version(scope->GetVersion());
    OtlpPopulateAttributeUtils::PopulateAttribute(proto_scope, *scope);
    scope_metrics->set_schema_url(scope->GetSchemaURL());
  }

  // Metrics
  for (const auto& batched_metric : metrics) {
    auto* proto_metric = scope_metrics->add_metrics();
    proto_metric->set_name(batched_metric.instrument_descriptor.name_);
    proto_metric->set_unit(batched_metric.instrument_descriptor.unit_);
    proto_metric->set_description("");
    auto type = batched_metric.instrument_descriptor.type_;
    auto value_type = batched_metric.instrument_descriptor.value_type_;
    // Type
    if (type == InstrumentType::kCounter) {
      auto* sum = proto_metric->mutable_sum();
      sum->set_aggregation_temporality(
          static_cast<proto::metrics::v1::AggregationTemporality>(
              batched_metric.aggregation_temporality));
      sum->set_is_monotonic(true);
      for (const auto& point : batched_metric.point_data_attr_) {
        auto* dp = sum->add_data_points();
        dp->set_start_time_unix_nano(point.start_ts.time_since_epoch().count());
        dp->set_time_unix_nano(point.end_ts.time_since_epoch().count());
        // Attributes
        SerializeAttributes(point.attributes, dp->mutable_attributes());
        // Value
        auto sum_data = std::get<SumPointData>(point.point_data);
        if (value_type == InstrumentValueType::kInt) {
          dp->set_as_int(std::get<int64_t>(sum_data.value_));
        } else {
          dp->set_as_double(std::get<double>(sum_data.value_));
        }
      }
    } else if (type == InstrumentType::kGauge) {
      auto* gauge = proto_metric->mutable_gauge();
      for (const auto& point : batched_metric.point_data_attr_) {
        auto* dp = gauge->add_data_points();
        dp->set_time_unix_nano(point.end_ts.time_since_epoch().count());
        SerializeAttributes(point.attributes, dp->mutable_attributes());
        auto gauge_data = std::get<LastValuePointData>(point.point_data);
        if (value_type == InstrumentValueType::kInt) {
          dp->set_as_int(std::get<int64_t>(gauge_data.value_));
        } else {
          dp->set_as_double(std::get<double>(gauge_data.value_));
        }
      }
    } else if (type == InstrumentType::kSummary) {
      auto* summary = proto_metric->mutable_summary();
      for (const auto& point : batched_metric.point_data_attr_) {
        auto* dp = summary->add_data_points();
        dp->set_start_time_unix_nano(point.start_ts.time_since_epoch().count());
        dp->set_time_unix_nano(point.end_ts.time_since_epoch().count());
        SerializeAttributes(point.attributes, dp->mutable_attributes());
        auto summary_data = std::get<SummaryPointData>(point.point_data);
        dp->set_sum(std::get<double>(summary_data.quantile_values_.at(0.5)));
        dp->set_count(1);
        for (const auto& q : summary_data.quantile_values_) {
          auto* quantile = dp->add_quantile_values();
          quantile->set_quantile(q.first);
          quantile->set_value(std::get<double>(q.second));
        }
      }
    }
  }
}

}  // namespace otlp
}  // namespace nsolid
}  // namespace node
