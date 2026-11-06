#include "gtest/gtest.h"
#include "otlp/src/datadog_metrics.h"
#include "otlp/src/dynatrace_metrics.h"
#include "otlp/src/newrelic_metrics.h"
#include "util.h"

using node::nsolid::otlp::DatadogMetrics;
using node::nsolid::otlp::DynatraceMetrics;
using node::nsolid::otlp::MetricsExporter;
using node::nsolid::otlp::NewRelicMetrics;

TEST(OTLPVendorMetrics, FirstSampleSeedsBaseline) {
  uv_loop_t loop;
  ASSERT_EQ(uv_loop_init(&loop), 0);
  auto config = nlohmann::json::parse(node::nsolid::GetConfig());
  node::nsolid::UpdateConfig(R"({"app":"otlp-vendor-metrics-test"})");
  {
    std::vector<std::unique_ptr<MetricsExporter>> exporters;
    exporters.emplace_back(
        new DatadogMetrics(&loop, "http://127.0.0.1:1", "key"));
    exporters.emplace_back(
        new DynatraceMetrics(&loop, "http://127.0.0.1:1", "key"));
    exporters.emplace_back(
        new NewRelicMetrics(&loop, "http://127.0.0.1:1", "key"));
    node::nsolid::ProcessMetrics::MetricsStor proc{};
    node::nsolid::ProcessMetrics::MetricsStor prev{};
    proc.timestamp = 1000;
    proc.uptime = 100;
    MetricsExporter::ThrMetricsStor thread{};
    thread.stor.timestamp = 1000;
    thread.stor.gc_count = 100;
    for (const auto& exporter : exporters) {
      exporter->got_proc_metrics(proc, prev);
      exporter->got_thr_metrics({thread});
      EXPECT_FALSE(uv_loop_alive(&loop));
    }
    prev = proc;
    proc.timestamp += 1000;
    proc.uptime++;
    thread.prev_stor = thread.stor;
    thread.stor.timestamp += 1000;
    thread.stor.gc_count++;
    for (const auto& exporter : exporters) {
      exporter->got_proc_metrics(proc, prev);
      EXPECT_TRUE(uv_loop_alive(&loop));
      uv_run(&loop, UV_RUN_DEFAULT);
      exporter->got_thr_metrics({thread});
      EXPECT_TRUE(uv_loop_alive(&loop));
      uv_run(&loop, UV_RUN_DEFAULT);
    }
  }
  uv_run(&loop, UV_RUN_DEFAULT);
  EXPECT_EQ(uv_loop_close(&loop), 0);
  node::nsolid::UpdateConfig(nlohmann::json({{"app", config["app"]}}).dump());
}
