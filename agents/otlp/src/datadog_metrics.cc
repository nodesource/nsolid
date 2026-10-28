#include "datadog_metrics.h"

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

const char* tid = "thread_id:";

DatadogMetrics::DatadogMetrics(uv_loop_t* loop,
                               const std::string& url,
                               const std::string& key): loop_(loop),
                                                        key_(key),
                                                        url_(url) {
  http_client_.reset(new OTLPHttpClient(loop_));
}

/*virtual*/
DatadogMetrics::~DatadogMetrics() {
}

/*virtual*/
void DatadogMetrics::got_proc_metrics(const ProcessMetricsStor& stor,
                                      const ProcessMetricsStor& prev_stor) {
  json series = json::array();

#define V(CType, CName, JSName, MType, Unit)                                   \
{                                                                              \
  auto it = std::find(discarded_metrics.begin(),                               \
                      discarded_metrics.end(),                                 \
                      #CName);                                                 \
  if (it == discarded_metrics.end()) {                                         \
    switch (MetricsType::MType) {                                              \
      case MetricsType::ECounter:                                              \
      {                                                                        \
        uint64_t ts = stor.timestamp / 1000;                                   \
        uint64_t prev_ts = prev_stor.timestamp / 1000;                         \
        json m = {                                                             \
          { "metric", "nsolid."#CName },                                       \
          { "type", "count" },                                                 \
          { "interval", ts - prev_ts },                                        \
          { "points", {{ ts, stor.CName - prev_stor.CName }}}                  \
        };                                                                     \
        series.push_back(m);                                                   \
      }                                                                        \
      break;                                                                   \
      case MetricsType::EGauge:                                                \
      {                                                                        \
        uint64_t ts = stor.timestamp / 1000;                                   \
        json m = {                                                             \
          { "metric", "nsolid."#CName },                                       \
          { "type", "gauge" },                                                 \
          { "points", {{ ts, stor.CName }}}                                    \
        };                                                                     \
        series.push_back(m);                                                   \
      }                                                                        \
      break;                                                                   \
      default:                                                                 \
      break;                                                                   \
    }                                                                          \
  }                                                                            \
}
  NSOLID_PROCESS_METRICS_NUMBERS(V)
#undef V

  json body = {
    { "series", series }
  };

  http_client_->post_datadog_metrics(url_,
                                     key_,
                                     body.dump());
}

/*virtual*/
void DatadogMetrics::got_thr_metrics(
    const std::vector<MetricsExporter::ThrMetricsStor>& thr_metrics) {
  json series = json::array();
  for (const auto& tm : thr_metrics) {
    got_thr_metrics(tm.stor, tm.prev_stor, series);
  }

  if (series.size() > 0) {
    json body = {
      { "series", series }
    };

    http_client_->post_datadog_metrics(url_,
                                       key_,
                                       body.dump());
  }
}

void DatadogMetrics::got_thr_metrics(const ThreadMetricsStor& stor,
                                     const ThreadMetricsStor& prev_stor,
                                     nlohmann::json& series) {
#define V(CType, CName, JSName, MType, Unit)                                   \
{                                                                              \
  auto it = std::find(discarded_metrics.begin(),                               \
                      discarded_metrics.end(),                                 \
                      #CName);                                                 \
  if (it == discarded_metrics.end()) {                                         \
    switch (MetricsType::MType) {                                              \
      case MetricsType::ECounter:                                              \
      {                                                                        \
        uint64_t ts = stor.timestamp / 1000;                                   \
        uint64_t prev_ts = prev_stor.timestamp / 1000;                         \
        json m = {                                                             \
          { "metric", "nsolid."#CName },                                       \
          { "type", "count" },                                                 \
          { "interval", ts - prev_ts },                                        \
          { "points", {{ ts, stor.CName - prev_stor.CName }}},                 \
          { "tags", { std::string(tid) + std::to_string(stor.thread_id) }}     \
        };                                                                     \
        series.push_back(m);                                                   \
      }                                                                        \
      break;                                                                   \
      case MetricsType::EGauge:                                                \
      {                                                                        \
        uint64_t ts = stor.timestamp / 1000;                                   \
        json m = {                                                             \
          { "metric", "nsolid."#CName },                                       \
          { "type", "gauge" },                                                 \
          { "points", {{ ts, stor.CName }}},                                   \
          { "tags", { std::string(tid) + std::to_string(stor.thread_id) }}     \
        };                                                                     \
        series.push_back(m);                                                   \
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

}  // namespace otlp
}  // namespace nsolid
}  // namespace node
