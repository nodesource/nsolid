#include "otlp_common.h"
// NOLINTNEXTLINE(build/c++11)
#include <chrono>
#include <ctime>
#include <iomanip>
#include <sstream>
#include <unordered_map>
#include "asserts-cpp/asserts.h"
#include "env-inl.h"
#include "nlohmann/json.hpp"
#include "nsuv-inl.h"
#include "opentelemetry/semconv/incubating/deployment_attributes.h"
#include "opentelemetry/semconv/incubating/host_attributes.h"
#include "opentelemetry/semconv/incubating/os_attributes.h"
#include "opentelemetry/semconv/incubating/process_attributes.h"
#include "opentelemetry/semconv/incubating/service_attributes.h"
#include "opentelemetry/semconv/incubating/thread_attributes.h"
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

using opentelemetry::common::SystemTimestamp;
using opentelemetry::sdk::instrumentationscope::InstrumentationScope;
using LogsRecordable = opentelemetry::sdk::logs::Recordable;
using opentelemetry::sdk::common::OwnedAttributeType;
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
using opentelemetry::sdk::trace::Recordable;
using opentelemetry::trace::SpanContext;
using opentelemetry::trace::SpanId;
using opentelemetry::trace::SpanKind;
using opentelemetry::trace::TraceFlags;
using opentelemetry::trace::TraceId;
using opentelemetry::semconv::deployment::kDeploymentEnvironmentName;
using opentelemetry::semconv::host::kHostArch;
using opentelemetry::semconv::host::kHostCpuModelName;
using opentelemetry::semconv::host::kHostName;
using opentelemetry::semconv::os::kOsType;
using opentelemetry::trace::propagation::detail::HexToBinary;
using opentelemetry::semconv::process::kProcessCreationTime;
using opentelemetry::semconv::process::kProcessExecutablePath;
using opentelemetry::semconv::process::kProcessOwner;
using opentelemetry::semconv::process::kProcessPid;
using opentelemetry::semconv::process::kProcessRuntimeDescription;
using opentelemetry::semconv::process::kProcessRuntimeName;
using opentelemetry::semconv::process::kProcessRuntimeVersion;
using opentelemetry::semconv::process::kProcessTitle;
using opentelemetry::semconv::service::kServiceName;
using opentelemetry::semconv::service::kServiceInstanceId;
using opentelemetry::semconv::service::kServiceVersion;
using opentelemetry::semconv::thread::kThreadId;
using opentelemetry::semconv::thread::kThreadName;

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

static std::shared_ptr<Resource> resource_g;
static std::shared_ptr<Resource> metrics_resource_g;

static nsuv::ns_mutex& ResourceMutex() {
  static int er = 0;
  static nsuv::ns_mutex mutex(&er, false);
  ASSERT_EQ(0, er);
  return mutex;
}

static std::string ToIso8601(uint64_t timestamp_ms) {
  if (timestamp_ms == 0) return "";

  const time_t seconds = static_cast<time_t>(timestamp_ms / 1000);
  std::tm tm{};
#ifdef _WIN32
  gmtime_s(&tm, &seconds);
#else
  gmtime_r(&seconds, &tm);
#endif

  std::ostringstream stream;
  stream << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S");

  const uint64_t millis = timestamp_ms % 1000;
  stream << '.' << std::setw(3) << std::setfill('0') << millis;

  stream << 'Z';
  return stream.str();
}

static std::string NormalizeOsType(const std::string& platform) {
  if (platform == "win32") return "windows";
  if (platform == "sunos") return "solaris";
  return platform;
}

static std::string NormalizeHostArch(const std::string& arch) {
  if (arch == "x64") return "amd64";
  if (arch == "ia32") return "x86";
  if (arch == "arm") return "arm32";
  return arch;
}

static ResourceAttributes GetMetadataResourceAttributes(const json& info) {
  ResourceAttributes attrs;

  if (info.is_discarded() || !info.is_object()) return attrs;

  auto it = info.find("app");
  if (it != info.end() && it->is_string()) {
    attrs.SetAttribute(kServiceName, it->get<std::string>());
  }

  attrs.SetAttribute(kServiceInstanceId, nsolid::GetAgentId());

  it = info.find("appVersion");
  if (it != info.end() && it->is_string()) {
    attrs.SetAttribute(kServiceVersion, it->get<std::string>());
  }

  it = info.find("hostname");
  if (it != info.end() && it->is_string()) {
    attrs.SetAttribute(kHostName, it->get<std::string>());
  }

  it = info.find("pid");
  if (it != info.end() && it->is_number_unsigned()) {
    attrs.SetAttribute(kProcessPid, static_cast<int64_t>(it->get<uint32_t>()));
  }

  it = info.find("arch");
  if (it != info.end() && it->is_string()) {
    attrs.SetAttribute(kHostArch, NormalizeHostArch(it->get<std::string>()));
  }

  it = info.find("platform");
  if (it != info.end() && it->is_string()) {
    attrs.SetAttribute(kOsType, NormalizeOsType(it->get<std::string>()));
  }

  it = info.find("execPath");
  if (it != info.end() && it->is_string()) {
    attrs.SetAttribute(kProcessExecutablePath, it->get<std::string>());
  }

  it = info.find("main");
  if (it != info.end() && it->is_string()) {
    attrs.SetAttribute("main", it->get<std::string>());
  }

  it = info.find("nodeEnv");
  if (it != info.end() && it->is_string()) {
    attrs.SetAttribute(kDeploymentEnvironmentName, it->get<std::string>());
  }

  it = info.find("versions");
  if (it != info.end() && it->is_object()) {
    auto version_it = it->find("node");
    if (version_it != it->end() && version_it->is_string()) {
      attrs.SetAttribute(kProcessRuntimeVersion,
                         version_it->get<std::string>());
    }

    version_it = it->find("nsolid");
    if (version_it != it->end() && version_it->is_string()) {
      std::string nsolid_version = version_it->get<std::string>();
      attrs.SetAttribute(kProcessRuntimeDescription,
                         "N|Solid " + nsolid_version);
    }
  }

  attrs.SetAttribute(kProcessRuntimeName, "nodejs");

  it = info.find("cpuCores");
  if (it != info.end() && it->is_number_unsigned()) {
    attrs.SetAttribute("cpuCores", std::to_string(it->get<uint32_t>()));
  }

  it = info.find("cpuModel");
  if (it != info.end() && it->is_string()) {
    attrs.SetAttribute(kHostCpuModelName, it->get<std::string>());
  }

  it = info.find("processStart");
  if (it != info.end() && it->is_number_unsigned()) {
    std::string iso_time = ToIso8601(it->get<uint64_t>());
    if (!iso_time.empty()) {
      attrs.SetAttribute(kProcessCreationTime, std::move(iso_time));
    }
  }

  it = info.find("tags");
  if (it != info.end() && it->is_array()) {
    std::string tags;
    for (const auto& tag : *it) {
      if (!tag.is_string()) continue;
      if (!tags.empty()) tags += ',';
      tags += tag.get<std::string>();
    }
    attrs.SetAttribute("tagsString", std::move(tags));
  }

  return attrs;
}

static std::shared_ptr<Resource> MergeResourceAttributes(
    const std::shared_ptr<Resource>& base,
    ResourceAttributes attrs) {
  auto resource_attributes = base->GetAttributes();
  if (resource_attributes.find(kServiceName) != resource_attributes.end() &&
      attrs.find(kServiceName) == attrs.end()) {
    attrs.SetAttribute(
        kServiceName,
        opentelemetry::nostd::get<std::string>(
            resource_attributes[kServiceName]));
  }
  auto overlay = std::make_shared<Resource>(Resource::Create(attrs));
  return std::make_shared<Resource>(base->Merge(*overlay));
}

InstrumentationScope* GetScope() {
  static std::unique_ptr<InstrumentationScope> scope =
    InstrumentationScope::Create("nsolid", NODE_VERSION "+ns" NSOLID_VERSION);
  return scope.get();
}

static void EnsureResourceInitializedLocked() {
  if (resource_g != nullptr) return;

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

  resource_g = std::make_shared<Resource>(Resource::Create(attrs));
}

std::shared_ptr<Resource> GetResource() {
  nsuv::ns_mutex::scoped_lock lock(ResourceMutex());
  EnsureResourceInitializedLocked();
  return resource_g;
}

static void EnsureMetricsResourceInitializedLocked() {
  if (metrics_resource_g != nullptr) return;

  EnsureResourceInitializedLocked();

  json info = json::parse(nsolid::GetProcessInfo(), nullptr, false);
  ResourceAttributes attrs = GetMetadataResourceAttributes(info);
  metrics_resource_g = MergeResourceAttributes(resource_g, std::move(attrs));
}

std::shared_ptr<Resource> GetMetricsResource() {
  nsuv::ns_mutex::scoped_lock lock(ResourceMutex());
  EnsureMetricsResourceInitializedLocked();
  return metrics_resource_g;
}

std::shared_ptr<Resource> UpdateResource(ResourceAttributes&& attrs) {
  nsuv::ns_mutex::scoped_lock lock(ResourceMutex());
  EnsureResourceInitializedLocked();

  ResourceAttributes metrics_attrs(attrs);
  resource_g = MergeResourceAttributes(resource_g, std::move(attrs));

  if (metrics_resource_g != nullptr) {
    metrics_resource_g = MergeResourceAttributes(metrics_resource_g,
                                                std::move(metrics_attrs));
  }

  return resource_g;
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
  SumPointData sum_point_data;
  sum_point_data.value_ = value;
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
  opentelemetry::sdk::metrics::LastValuePointData lv_point_data;
  lv_point_data.value_ = value;
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

// NOLINTNEXTLINE(runtime/references)
static void add_summary(std::vector<MetricData>& metrics,
                        const time_point& start,
                        const time_point& end,
                        const char* name,
                        const char* unit,
                        InstrumentValueType type,
                        std::unordered_map<double, ValueType>&& values,
                        PointAttributes attrs = {}) {
  opentelemetry::sdk::metrics::SummaryPointData summary_point_data{};
  summary_point_data.quantile_values_ = std::move(values);
  MetricData metric_data{
    InstrumentDescriptor{
      name, "", unit, InstrumentType::kSummary, type },
    AggregationTemporality::kUnspecified,
    SystemTimestamp{ start },
    SystemTimestamp{ end },
    std::vector<PointDataAttributes>{{ attrs, summary_point_data }}
  };
  metrics.push_back(metric_data);
}

// NOLINTNEXTLINE(runtime/references)
void fill_proc_metrics(std::vector<MetricData>& metrics,
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
        add_counter(metrics,                                                   \
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
        add_gauge(metrics,                                                     \
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

  // Update Resource if needed:
  // Check if 'user' or 'title' are different from the previous metrics.
  if (prev_stor.user != stor.user || prev_stor.title != stor.title) {
    ResourceAttributes attrs = {
      { kProcessOwner, stor.user },
      { kProcessTitle, stor.title },
    };

    USE(UpdateResource(std::move(attrs)));
  }
}

// NOLINTNEXTLINE(runtime/references)
void fill_env_metrics(std::vector<MetricData>& metrics,
                      const ThreadMetrics::MetricsStor& stor,
                      bool use_snake_case) {
  time_point end{
        duration_cast<time_point::duration>(
          milliseconds(static_cast<uint64_t>(stor.timestamp)))};

  InstrumentValueType type;
  ValueType value;

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
        add_counter(metrics,                                                   \
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
        add_gauge(metrics,                                                     \
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
  add_summary(metrics,
              process_start,
              end,
              use_snake_case ? "gc_dur_us" : "gcDurUs",
              kNSUSecs,
              InstrumentValueType::kDouble,
              {{ 0.5, stor.gc_dur_us_median },
               { 0.99, stor.gc_dur_us99_ptile }},
              attrs);
  add_summary(metrics,
              process_start,
              end,
              "dns",
              kNSMSecs,
              InstrumentValueType::kDouble,
              {{ 0.5, stor.dns_median }, { 0.99, stor.dns99_ptile }},
              attrs);
  add_summary(metrics,
              process_start,
              end,
              use_snake_case ? "http_client" : "httpClient",
              kNSMSecs,
              InstrumentValueType::kDouble,
              {{ 0.5, stor.http_client_median },
               { 0.99, stor.http_client99_ptile }},
              attrs);
  add_summary(metrics,
              process_start,
              end,
              use_snake_case ? "http_server" : "httpServer",
              kNSMSecs,
              InstrumentValueType::kDouble,
              {{ 0.5, stor.http_server_median },
               { 0.99, stor.http_server99_ptile }},
              attrs);
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
  auto resource = GetResource();
  recordable->SetResource(*resource);
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

  auto resource = GetResource();
  recordable->SetResource(*resource);
}

}  // namespace otlp
}  // namespace nsolid
}  // namespace node
