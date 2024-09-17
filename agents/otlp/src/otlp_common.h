#ifndef AGENTS_OTLP_SRC_OTLP_COMMON_H_
#define AGENTS_OTLP_SRC_OTLP_COMMON_H_

#include "nsolid.h"
#include "opentelemetry/sdk/metrics/data/metric_data.h"

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
namespace resource {
class Resource;
}
namespace trace {
class Recordable;
}
}  // namespace sdk
OPENTELEMETRY_END_NAMESPACE

namespace node {
namespace nsolid {
namespace otlp {

OPENTELEMETRY_NAMESPACE::sdk::instrumentationscope::InstrumentationScope*
    GetScope();

OPENTELEMETRY_NAMESPACE::sdk::resource::Resource* GetResource();

void fill_proc_metrics(std::vector<opentelemetry::sdk::metrics::MetricData>&,
                       const ProcessMetrics::MetricsStor& stor);

void fill_env_metrics(std::vector<opentelemetry::sdk::metrics::MetricData>&,
                      const ThreadMetrics::MetricsStor& stor);

void fill_log_recordable(OPENTELEMETRY_NAMESPACE::sdk::logs::Recordable*,
                         const LogWriteInfo&);

void fill_recordable(OPENTELEMETRY_NAMESPACE::sdk::trace::Recordable*,
                     const Tracer::SpanStor&);


}  // namespace otlp
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_OTLP_SRC_OTLP_COMMON_H_
