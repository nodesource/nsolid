#include "nsolid_metrics.h"

#include <algorithm>

#include "util.h"

namespace node {
namespace nsolid {

using opentelemetry::sdk::metrics::MetricAttributes;

static const char* HttpMethodToString(HttpMethod m) {
  switch (m) {
    case HttpMethod::kGet:
      return "GET";
    case HttpMethod::kHead:
      return "HEAD";
    case HttpMethod::kPost:
      return "POST";
    case HttpMethod::kPut:
      return "PUT";
    case HttpMethod::kDelete:
      return "DELETE";
    case HttpMethod::kConnect:
      return "CONNECT";
    case HttpMethod::kOptions:
      return "OPTIONS";
    case HttpMethod::kTrace:
      return "TRACE";
    case HttpMethod::kPatch:
      return "PATCH";
    case HttpMethod::kOther:
      return "_OTHER";
  }
  return "_OTHER";
}

static const char* HttpProtocolVersionToString(HttpProtocolVersion v) {
  switch (v) {
    case HttpProtocolVersion::k10:
      return "1.0";
    case HttpProtocolVersion::k11:
      return "1.1";
    case HttpProtocolVersion::k2:
      return "2";
    case HttpProtocolVersion::kOther:
      return "";
  }
  return "";
}

static const char* HttpUrlSchemeToString(HttpUrlScheme s) {
  switch (s) {
    case HttpUrlScheme::kHttp:
      return "http";
    case HttpUrlScheme::kHttps:
      return "https";
    case HttpUrlScheme::kOther:
      return "";
  }
  return "";
}

// Build OTel MetricAttributes from HttpDatapointAttrs for attribute-keyed
// histogram aggregation.
MetricAttributes BuildMetricAttributes(const HttpDatapointAttrs& http,
                                       MetricType type) {
  MetricAttributes attrs;
  attrs.insert(
      {"http.request.method", std::string(HttpMethodToString(http.method))});
  if (http.status_code != 0) {
    attrs.insert(
        {"http.response.status_code", static_cast<int64_t>(http.status_code)});
  }
  if (!http.error_type.empty()) {
    attrs.insert({"error.type", http.error_type});
  }
  const char* version = HttpProtocolVersionToString(http.protocol_version);
  if (version[0] != '\0') {
    attrs.insert({"network.protocol.version", std::string(version)});
  }
  if (type == MetricType::kHttpClient) {
    if (!http.server_address.empty()) {
      attrs.insert({"server.address", http.server_address});
    }
    if (http.server_port != 0) {
      attrs.insert({"server.port", static_cast<int64_t>(http.server_port)});
    }
  } else {
    const char* scheme = HttpUrlSchemeToString(http.url_scheme);
    if (scheme[0] != '\0') {
      attrs.insert({"url.scheme", std::string(scheme)});
    }
    // Add http.route for server-side metrics when route template is available
    if (!http.route.empty()) {
      attrs.insert({"http.route", http.route});
    }
  }
  return attrs;
}

void AggregateHistogram(AttributesHashMap* hashmap,
                        double value_seconds,
                        MetricAttributes&& metric_attrs) {
  using opentelemetry::sdk::metrics::Aggregation;
  using opentelemetry::sdk::metrics::Base2ExponentialHistogramAggregation;

  auto factory = []() -> std::unique_ptr<Aggregation> {
    return std::make_unique<Base2ExponentialHistogramAggregation>();
  };
  auto* agg = hashmap->GetOrSetDefault(std::move(metric_attrs), factory);
  agg->Aggregate(value_seconds);
}

void MergeHistogramPoints(SharedPointDataAttributes& accumulated,
                          const SharedPointDataAttributes& next,
                          size_t cardinality_limit) {
  using opentelemetry::sdk::metrics::GetOverflowAttributes;
  using opentelemetry::sdk::metrics::PointDataAttributes;
  using HistogramAggregation =
      opentelemetry::sdk::metrics::Base2ExponentialHistogramAggregation;
  using HistogramPoint =
      opentelemetry::sdk::metrics::Base2ExponentialHistogramPointData;

  if (!next || next->empty()) return;
  if (!accumulated) {
    accumulated = std::make_shared<PointDataAttributesVector>();
  }

  // Each exporter retains its own view of the completed windows.
  if (accumulated.use_count() > 1) {
    accumulated = std::make_shared<PointDataAttributesVector>(*accumulated);
  }

  const auto& overflow_attributes = GetOverflowAttributes();
  size_t regular_attributes =
      std::count_if(accumulated->begin(),
                    accumulated->end(),
                    [&overflow_attributes](const PointDataAttributes& point) {
                      return point.attributes != overflow_attributes;
                    });

  for (const auto& next_point : *next) {
    const bool overflow = next_point.attributes == overflow_attributes;
    auto it = std::find_if(accumulated->begin(),
                           accumulated->end(),
                           [&next_point](const PointDataAttributes& point) {
                             return point.attributes == next_point.attributes;
                           });
    const bool over_limit = !overflow && it == accumulated->end() &&
                            regular_attributes >= cardinality_limit;
    const auto& attributes =
        overflow || over_limit ? overflow_attributes : next_point.attributes;
    if (over_limit) {
      it = std::find_if(
          accumulated->begin(),
          accumulated->end(),
          [&overflow_attributes](const PointDataAttributes& point) {
            return point.attributes == overflow_attributes;
          });
    }
    if (it == accumulated->end()) {
      accumulated->push_back({attributes, next_point.point_data});
      if (!overflow && !over_limit) regular_attributes++;
      continue;
    }

    auto* accumulated_histogram =
        opentelemetry::nostd::get_if<HistogramPoint>(&it->point_data);
    const auto* next_histogram =
        opentelemetry::nostd::get_if<HistogramPoint>(&next_point.point_data);
    CHECK_NOT_NULL(accumulated_histogram);
    CHECK_NOT_NULL(next_histogram);
    HistogramAggregation accumulated_aggregation(*accumulated_histogram);
    HistogramAggregation next_aggregation(*next_histogram);
    auto merged = accumulated_aggregation.Merge(next_aggregation);
    it->point_data = merged->ToPoint();
  }
}

}  // namespace nsolid
}  // namespace node
