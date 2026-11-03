#ifndef SRC_NSOLID_NSOLID_METRICS_H_
#define SRC_NSOLID_NSOLID_METRICS_H_

#include <cstdint>
#include <memory>
#include <string>
#include <unordered_map>
#include <variant>
#include <vector>

#include "opentelemetry/sdk/metrics/aggregation/base2_exponential_histogram_aggregation.h"
#include "opentelemetry/sdk/metrics/data/point_data.h"
#include "opentelemetry/sdk/metrics/state/attributes_hashmap.h"

namespace node {
namespace nsolid {

enum class MetricType : uint8_t { kDns, kHttpClient, kHttpServer, kGc };

enum class HttpMethod : uint8_t {
  kGet,
  kHead,
  kPost,
  kPut,
  kDelete,
  kConnect,
  kOptions,
  kTrace,
  kPatch,
  kOther
};

enum class HttpProtocolVersion : uint8_t {
  k10, /**< HTTP/1.0 */
  k11, /**< HTTP/1.1 */
  k2,  /**< HTTP/2 */
  kOther
};

enum class HttpUrlScheme : uint8_t { kHttp, kHttps, kOther };

struct HttpDatapointAttrs {
  HttpMethod method;                    /**< http.request.method */
  uint16_t status_code;                 /**< http.response.status_code */
  std::string server_address;           /**< server.address (client only) */
  uint16_t server_port;                 /**< server.port (client only) */
  HttpUrlScheme url_scheme;             /**< url.scheme (server only) */
  HttpProtocolVersion protocol_version; /**< network.protocol.version */
  std::string route;      /**< http.route (server only, route template) */
  std::string error_type; /**< error.type */
};

struct DnsDatapointAttrs {
  std::string question_name; /**< dns.question.name */
  std::string error_type;    /**< error.type */
};

struct GcDatapointAttrs {
  uint8_t type;   /**< Raw v8::GCType value */
  uint32_t flags; /**< Raw v8::GCCallbackFlags bitmask */
};

using DatapointAttrs =
    std::variant<HttpDatapointAttrs, DnsDatapointAttrs, GcDatapointAttrs>;

struct MetricDatapoint {
  uint64_t thread_id;
  MetricType type;
  double value;
  DatapointAttrs attrs;
};

// Type alias for histogram point data attributes vector
using PointDataAttributesVector =
    std::vector<opentelemetry::sdk::metrics::PointDataAttributes>;

// Shared pointer to point data attributes (used for histogram caching)
using SharedPointDataAttributes = std::shared_ptr<PointDataAttributesVector>;

struct HistogramSnapshot {
  uint64_t start_timestamp_ms;
  uint64_t end_timestamp_ms;
  SharedPointDataAttributes client_points;
  SharedPointDataAttributes server_points;
  SharedPointDataAttributes dns_points;
  SharedPointDataAttributes gc_points;
};

// Type alias for attributes hashmap (used for metric aggregation)
using AttributesHashMap = opentelemetry::sdk::metrics::AttributesHashMap;

// Unique pointer to attributes hashmap
using UniqueAttributesHashMap = std::unique_ptr<AttributesHashMap>;

constexpr size_t kHistogramCardinalityLimit =
    opentelemetry::sdk::metrics::kAggregationCardinalityLimit;

opentelemetry::sdk::metrics::MetricAttributes BuildMetricAttributes(
    const HttpDatapointAttrs& http, MetricType type);

void AggregateHistogram(
    AttributesHashMap* hashmap,
    double value_seconds,
    opentelemetry::sdk::metrics::MetricAttributes&& metric_attrs);

void MergeHistogramPoints(
    SharedPointDataAttributes& accumulated,
    const SharedPointDataAttributes& next,
    size_t cardinality_limit = kHistogramCardinalityLimit);

}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_NSOLID_METRICS_H_
