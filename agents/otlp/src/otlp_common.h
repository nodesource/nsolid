#ifndef AGENTS_OTLP_SRC_OTLP_COMMON_H_
#define AGENTS_OTLP_SRC_OTLP_COMMON_H_

#include <map>
#include <memory>
#include <string>
#include <tuple>

#include "nlohmann/json.hpp"
#include "nsolid.h"
#include "nsolid/nsolid_api.h"
#include "nsolid/nsolid_metrics.h"
#include "nsolid/nsolid_otel_metrics_types.h"
#include "opentelemetry/sdk/metrics/data/metric_data.h"
#include "opentelemetry/sdk/metrics/data/point_data.h"
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

using OtelMetricsMap =
    std::map<std::tuple<std::string, std::string, std::string>,
             std::vector<opentelemetry::sdk::metrics::MetricData>>;

OPENTELEMETRY_NAMESPACE::sdk::instrumentationscope::InstrumentationScope*
    GetScope();

std::shared_ptr<OPENTELEMETRY_NAMESPACE::sdk::resource::Resource>
    GetResource();

std::shared_ptr<OPENTELEMETRY_NAMESPACE::sdk::resource::Resource>
    GetMetricsResource();

nlohmann::json GetVendorMetricAttributes(
    const OPENTELEMETRY_NAMESPACE::sdk::resource::Resource& resource);

std::string GetVendorMetricDimensions(
    const OPENTELEMETRY_NAMESPACE::sdk::resource::Resource& resource);

void InvalidateMetricsResource();

bool UseGrpcSslCredentials(const std::string& url, const char* insecure_env);

std::shared_ptr<OPENTELEMETRY_NAMESPACE::sdk::resource::Resource>
    UpdateResource(
    OPENTELEMETRY_NAMESPACE::sdk::resource::ResourceAttributes&&);

void fill_proc_metrics(std::vector<opentelemetry::sdk::metrics::MetricData>&,
                       const ProcessMetrics::MetricsStor& stor,
                       const ProcessMetrics::MetricsStor& prev_stor,
                       bool use_snake_case = true);

void fill_env_metrics(std::vector<opentelemetry::sdk::metrics::MetricData>&,
                      const ThreadMetrics::MetricsStor& stor,
                      bool use_snake_case = true);

void fill_http_histograms(std::vector<opentelemetry::sdk::metrics::MetricData>&,
                          const ThreadMetrics::MetricsStor& stor,
                          SharedPointDataAttributes http_client_points,
                          SharedPointDataAttributes http_server_points,
                          bool use_snake_case = true,
                          uint64_t start_timestamp_ms = 0,
                          uint64_t end_timestamp_ms = 0);
// Convert one provider's snapshot; do not share the map between providers.
void fill_otel_instruments(OtelMetricsMap&, const OtelMetricsStor& instruments);

void fill_log_recordable(OPENTELEMETRY_NAMESPACE::sdk::logs::Recordable*,
                         const LogWriteInfo&);

void fill_recordable(OPENTELEMETRY_NAMESPACE::sdk::trace::Recordable*,
                     const Tracer::SpanStor&);


}  // namespace otlp
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_OTLP_SRC_OTLP_COMMON_H_
