#include "newrelic_metrics.h"

#include <algorithm>

#include "asserts-cpp/asserts.h"

using ProcessMetricsStor = node::nsolid::ProcessMetrics::MetricsStor;
using ThreadMetricsStor = node::nsolid::ThreadMetrics::MetricsStor;
using nlohmann::json;

namespace node {
namespace nsolid {
namespace otlp {

static std::vector<std::string> discarded_metrics = {
  "thread_id", "timestamp"
};

NewRelicMetrics::NewRelicMetrics(uv_loop_t* loop,
                                 const std::string& url,
                                 const std::string& key)
    : loop_(loop),
      key_(key),
      url_(url) {
  http_client_.reset(new OTLPHttpClient(loop_));
}

/*virtual*/
NewRelicMetrics::~NewRelicMetrics() {
}

/*virtual*/
void NewRelicMetrics::got_proc_metrics(
    const ProcessMetricsStor& stor,
    const ProcessMetricsStor& prev_stor) {
  json metrics = json::array();

#define V(CType, CName, JSName, MType, Unit)                                   \
{                                                                              \
  auto it = std::find(discarded_metrics.begin(),                               \
                      discarded_metrics.end(),                                 \
                      #CName);                                                 \
  if (it == discarded_metrics.end()) {                                         \
    switch (MetricsType::MType) {                                              \
      case MetricsType::ECounter:                                              \
      {                                                                        \
        json m = {                                                             \
          { "name", "nsolid."#CName },                                         \
          { "type", "count" },                                                 \
          { "value", stor.CName - prev_stor.CName }                            \
        };                                                                     \
        metrics.push_back(m);                                                  \
      }                                                                        \
      break;                                                                   \
      case MetricsType::EGauge:                                                \
      {                                                                        \
        json m = {                                                             \
          { "name", "nsolid."#CName },                                         \
          { "type", "gauge" },                                                 \
          { "value", stor.CName }                                              \
        };                                                                     \
        metrics.push_back(m);                                                  \
      }                                                                        \
      break;                                                                   \
      default:                                                                 \
      break;                                                                   \
    }                                                                          \
  }                                                                            \
}
  NSOLID_PROCESS_METRICS_NUMBERS(V)
#undef V

  json body = json::array();
  json common = {
    { "timestamp", stor.timestamp },
    { "interval.ms", stor.timestamp - prev_stor.timestamp }
  };

  body.push_back({
    { "common", common },
    { "metrics", metrics }
  });

  http_client_->post_newrelic_metrics(url_,
                                      key_,
                                      body.dump());
}

/*virtual*/
void NewRelicMetrics::got_thr_metrics(
    const std::vector<MetricsExporter::ThrMetricsStor>& thr_metrics) {
  json body = json::array();
  for (const auto& tm : thr_metrics) {
    body.push_back(got_thr_metrics(tm.stor, tm.prev_stor));
  }

  if (body.size() > 0) {
    http_client_->post_newrelic_metrics(url_,
                                        key_,
                                        body.dump());
  }
}

json NewRelicMetrics::got_thr_metrics(const ThreadMetricsStor& stor,
                                      const ThreadMetricsStor& prev_stor) {
  json metrics = json::array();
#define V(CType, CName, JSName, MType, Unit)                                   \
{                                                                              \
  auto it = std::find(discarded_metrics.begin(),                               \
                      discarded_metrics.end(),                                 \
                      #CName);                                                 \
  if (it == discarded_metrics.end()) {                                         \
    switch (MetricsType::MType) {                                              \
      case MetricsType::ECounter:                                              \
      {                                                                        \
        json m = {                                                             \
          { "name", "nsolid."#CName },                                         \
          { "type", "count" },                                                 \
          { "value", stor.CName - prev_stor.CName }                            \
        };                                                                     \
        metrics.push_back(m);                                                  \
      }                                                                        \
      break;                                                                   \
      case MetricsType::EGauge:                                                \
      {                                                                        \
        json m = {                                                             \
          { "name", "nsolid."#CName },                                         \
          { "type", "gauge" },                                                 \
          { "value", stor.CName }                                              \
        };                                                                     \
        metrics.push_back(m);                                                  \
      }                                                                        \
      break;                                                                   \
      default:                                                                 \
      break;                                                                   \
    }                                                                          \
  }                                                                            \
}
  NSOLID_ENV_METRICS_NUMBERS(V)
#undef V

  json common = {
    { "timestamp", stor.timestamp },
    { "interval.ms", stor.timestamp - prev_stor.timestamp },
    { "attributes", {
      { "thread_id", stor.thread_id },
      { "thread_name", stor.thread_name }
    }}
  };

  json thr_metrics = {
    { "common", common },
    { "metrics", metrics }
  };

  return thr_metrics;
}

}  // namespace otlp
}  // namespace nsolid
}  // namespace node
