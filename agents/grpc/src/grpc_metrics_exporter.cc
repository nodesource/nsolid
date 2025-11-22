#include "grpc_metrics_exporter.h"
#include "grpc_client.h"

#include "../../otlp/src/otlp_common.h"
#include "opentelemetry/exporters/otlp/otlp_grpc_client.h"
#include "opentelemetry/exporters/otlp/otlp_metric_utils.h"

using
  opentelemetry::proto::collector::metrics::v1::ExportMetricsServiceRequest;
using
  opentelemetry::proto::collector::metrics::v1::ExportMetricsServiceResponse;
using opentelemetry::proto::collector::metrics::v1::MetricsService;
using opentelemetry::sdk::common::ExportResult;
using opentelemetry::sdk::metrics::ResourceMetrics;
using opentelemetry::v1::exporter::otlp::OtlpGrpcClient;
using opentelemetry::v1::exporter::otlp::OtlpGrpcMetricExporterOptions;
using opentelemetry::v1::exporter::otlp::OtlpMetricUtils;

namespace node {
namespace nsolid {
namespace grpc {

using SharedGrpcMetricsExporter = std::shared_ptr<GrpcMetricsExporter>;
using WeakGrpcMetricsExporter = std::weak_ptr<GrpcMetricsExporter>;

GrpcMetricsExporter::GrpcMetricsExporter(
  uv_loop_t* loop,
  OtlpGrpcMetricExporterOptions options,
  std::shared_ptr<OtlpGrpcClient> client,
  size_t buffer_size):
    loop_(loop),
    options_(options),
    client_(client),
    metrics_service_stub_(client_->MakeMetricsServiceStub()),
    metrics_q_(buffer_size),
    in_flight_(false) {
}

void GrpcMetricsExporter::init() {
  metrics_completion_q_ = AsyncTSQueue<::grpc::Status>::create(
    loop_,
    +[](::grpc::Status status, WeakGrpcMetricsExporter exporter_wp) {
      SharedGrpcMetricsExporter exporter = exporter_wp.lock();
      if (exporter == nullptr) {
        return;
      }

      exporter->on_metrics_export_complete(status);
    },
    weak_from_this());
}

GrpcMetricsExporter::~GrpcMetricsExporter() {
}

void GrpcMetricsExporter::enqueue(
    std::vector<otlp::BatchedMetricData>&& metrics) {
  metrics_q_.push(std::move(metrics));
  if (!in_flight_) {
    export_current();
  }
}

void GrpcMetricsExporter::export_current() {
  if (metrics_q_.empty()) {
    return;
  }

  auto* stub = metrics_service_stub_.get();
  if (stub == nullptr) {
    return;
  }

  auto& data = metrics_q_.front();

  google::protobuf::ArenaOptions arena_options;
  arena_options.initial_block_size = 1024;
  arena_options.max_block_size = 65536;
  auto arena = std::make_unique<google::protobuf::Arena>(arena_options);

  auto* request =
    google::protobuf::Arena::Create<ExportMetricsServiceRequest>(arena.get());

  otlp::PopulateRequest(data, otlp::GetResource(), otlp::GetScope(), request);

  auto context = OtlpGrpcClient::MakeClientContext(options_);
  ::grpc::Status immediate =
    GrpcClient::DelegateAsyncExport<MetricsServiceStub,
                                    ExportMetricsServiceRequest,
                                    ExportMetricsServiceResponse>(
      stub,
      &MetricsServiceStub::async_interface::Export,
      std::move(context),
      std::move(arena),
      std::move(*request),
      [weak = weak_from_this()](::grpc::Status status,
                                std::unique_ptr<google::protobuf::Arena>&&,
                                const ExportMetricsServiceRequest&,
                                ExportMetricsServiceResponse*) {
      auto exporter = weak.lock();
      if (exporter != nullptr) {
        exporter->metrics_completion_q_->enqueue(status);
      }
    });

  if (!immediate.ok()) {
    metrics_completion_q_->enqueue(immediate);
  } else {
    in_flight_ = true;
  }
}

void GrpcMetricsExporter::flush() {
  export_current();
}

void GrpcMetricsExporter::resize_buffer(size_t new_buffer_size) {
  metrics_q_.resize(new_buffer_size);
}

void GrpcMetricsExporter::on_metrics_export_complete(::grpc::Status status) {
  in_flight_ = false;
  if (status.ok()) {
    metrics_q_.pop();
    export_current();
  }
}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node
