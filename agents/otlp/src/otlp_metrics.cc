// This header needs to be included before any other grpc header otherwise there
// will be a compilation error because of abseil.
// Refs: https://github.com/open-telemetry/opentelemetry-cpp/blob/32cd66b62333e84aa8e92a4447e0aa667b6735e5/examples/otlp/README.md#additional-notes-regarding-abseil-library
#include "opentelemetry/exporters/otlp/otlp_grpc_metric_exporter.h"
#include "otlp_metrics.h"
#include "otlp_common.h"
#include "debug_utils-inl.h"
#include "env-inl.h"
#include "opentelemetry/exporters/otlp/otlp_environment.h"
#include "opentelemetry/exporters/otlp/otlp_http_metric_exporter.h"
#include "opentelemetry/trace/semantic_conventions.h"
#include "opentelemetry/sdk/metrics/data/metric_data.h"
#include "opentelemetry/sdk/metrics/export/metric_producer.h"

#include <algorithm>
// NOLINTNEXTLINE(build/c++11)
#include <chrono>

#include "asserts-cpp/asserts.h"

using ProcessMetricsStor = node::nsolid::ProcessMetrics::MetricsStor;
using ThreadMetricsStor = node::nsolid::ThreadMetrics::MetricsStor;
using std::chrono::duration_cast;
using time_point = std::chrono::system_clock::time_point;
using std::chrono::microseconds;
using std::chrono::milliseconds;

using opentelemetry::exporter::otlp::HttpRequestContentType;
using opentelemetry::sdk::instrumentationscope::InstrumentationScope;
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
using opentelemetry::sdk::resource::Resource;
using opentelemetry::sdk::resource::ResourceAttributes;
using opentelemetry::v1::exporter::otlp::GetOtlpDefaultHttpMetricsProtocol;
using opentelemetry::v1::exporter::otlp::OtlpGrpcMetricExporter;
using opentelemetry::v1::exporter::otlp::OtlpGrpcMetricExporterOptions;
using opentelemetry::v1::exporter::otlp::OtlpHttpMetricExporter;
using opentelemetry::v1::exporter::otlp::OtlpHttpMetricExporterOptions;
using opentelemetry::v1::trace::SemanticConventions::kProcessOwner;
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
                         InstrumentationScope* scope):
    scope_(scope) {
  const std::string prot = GetOtlpDefaultHttpMetricsProtocol();
  if (prot == "grpc") {
    OtlpGrpcMetricExporterOptions opts;
    otlp_metric_exporter_ = std::make_unique<OtlpGrpcMetricExporter>(opts);
  } else {
    OtlpHttpMetricExporterOptions opts;
    opts.console_debug = true;
    otlp_metric_exporter_ = std::make_unique<OtlpHttpMetricExporter>(opts);
  }
}

OTLPMetrics::OTLPMetrics(uv_loop_t* loop,
                         const std::string& url,
                         const std::string& key,
                         bool is_http,
                         InstrumentationScope* scope):
    scope_(scope),
    key_(key),
    url_(url) {
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

/*virtual*/
void OTLPMetrics::got_proc_metrics(const ProcessMetricsStor& stor,
                                   const ProcessMetricsStor& prev_stor) {
  ResourceMetrics data;
  Resource* resource;
  // Check if 'user' or 'title' are different from the previous metrics
  if (prev_stor.user != stor.user || prev_stor.title != stor.title) {
    ResourceAttributes attrs = {
      { kProcessOwner, stor.user },
      { "process.title", stor.title },
    };

    resource = UpdateResource(std::move(attrs));
  } else {
    resource = GetResource();
  }

  data.resource_ = resource;
  std::vector<MetricData> metrics;
  fill_proc_metrics(metrics, stor);
  data.scope_metric_data_ = std::vector<ScopeMetrics>{{scope_, metrics}};
  auto result = otlp_metric_exporter_->Export(data);
  Debug("# ProcessMetrics Exported. Result: %d\n", static_cast<int>(result));
}

/*virtual*/
void OTLPMetrics::got_thr_metrics(
    const std::vector<MetricsExporter::ThrMetricsStor>& thr_metrics) {
  ResourceMetrics data;
  data.resource_ = GetResource();
  std::vector<MetricData> metrics;

  for (const auto& tm : thr_metrics) {
    fill_env_metrics(metrics, tm.stor);
  }

  data.scope_metric_data_ =
    std::vector<ScopeMetrics>{{scope_, metrics}};
  auto result = otlp_metric_exporter_->Export(data);
  Debug("# ThreadMetrics Exported. Result: %d\n", static_cast<int>(result));
}
}  // namespace otlp
}  // namespace nsolid
}  // namespace node
