#ifndef AGENTS_GRPC_SRC_GRPC_METRICS_EXPORTER_H_
#define AGENTS_GRPC_SRC_GRPC_METRICS_EXPORTER_H_

#include <queue>
#include <memory>
#include <string>

#include "../../otlp/src/batched_metric_data.h"
#include "nsolid/async_ts_queue.h"
#include "nsolid/nsolid_util.h"
#include "opentelemetry/exporters/otlp/otlp_grpc_client.h"
#include "opentelemetry/exporters/otlp/otlp_grpc_metric_exporter_options.h"
#include "opentelemetry/proto/collector/metrics/v1/metrics_service.grpc.pb.h"
#include "opentelemetry/sdk/common/exporter_utils.h"
#include "opentelemetry/sdk/metrics/export/metric_producer.h"

// Class pre-declaration
OPENTELEMETRY_BEGIN_NAMESPACE
namespace exporter {
namespace otlp {
class OtlpGrpcClient;
}
}
namespace sdk {
namespace trace {
}
}
OPENTELEMETRY_END_NAMESPACE

namespace node {
namespace nsolid {
namespace grpc {

class GrpcMetricsExporter:
    public std::enable_shared_from_this<GrpcMetricsExporter> {
 public:
  explicit GrpcMetricsExporter(
    uv_loop_t* loop,
    opentelemetry::v1::exporter::otlp::OtlpGrpcMetricExporterOptions options,
    std::shared_ptr<opentelemetry::v1::exporter::otlp::OtlpGrpcClient> client,
    size_t buffer_size);
  ~GrpcMetricsExporter();

  GrpcMetricsExporter(const GrpcMetricsExporter&) = delete;
  GrpcMetricsExporter& operator=(const GrpcMetricsExporter&) = delete;

  void init();

  void enqueue(std::vector<otlp::BatchedMetricData>&& metrics);

  void flush();

  void resize_buffer(size_t new_buffer_size);

 private:
  using MetricsServiceStub =
    opentelemetry::proto::collector::metrics::v1::MetricsService::StubInterface;

  void export_current();

  void on_metrics_export_complete(::grpc::Status status);

  uv_loop_t* loop_;
  opentelemetry::v1::exporter::otlp::OtlpGrpcMetricExporterOptions options_;
  std::shared_ptr<opentelemetry::v1::exporter::otlp::OtlpGrpcClient> client_;
  std::unique_ptr<MetricsServiceStub> metrics_service_stub_;
  utils::RingBuffer<std::vector<otlp::BatchedMetricData>> metrics_q_;
  bool in_flight_;
  std::shared_ptr<AsyncTSQueue<::grpc::Status>> metrics_completion_q_;
};

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_GRPC_METRICS_EXPORTER_H_

