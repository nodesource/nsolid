#ifndef AGENTS_GRPC_SRC_GRPC_CLIENT_H_
#define AGENTS_GRPC_SRC_GRPC_CLIENT_H_

#include "../../src/profile_collector.h"
#include "./proto/nsolid_service.grpc.pb.h"
#include "grpcpp/grpcpp.h"
#include "opentelemetry/version.h"

OPENTELEMETRY_BEGIN_NAMESPACE
namespace exporter {
namespace otlp {
struct OtlpGrpcClientOptions;
}
}
OPENTELEMETRY_END_NAMESPACE

using opentelemetry::v1::exporter::otlp::OtlpGrpcClientOptions;

namespace node {
namespace nsolid {
namespace grpc {

class GrpcClient {
 public:
  /**
   * Create gRPC channel.
   */
  static std::shared_ptr<::grpc::Channel>
    MakeChannel(const OtlpGrpcClientOptions& options);

  /**
   * Create gRPC client context to call RPC.
   */
  static std::unique_ptr<::grpc::ClientContext>
    MakeClientContext(const std::string& agent_id, const std::string& saas);

  /**
   * Create N|Solid service stub to communicate with the N|Solid Console.
   */
  static std::unique_ptr<grpcagent::NSolidService::StubInterface>
    MakeNSolidServiceStub(const OtlpGrpcClientOptions& options);

  static int DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::BlockedLoopEvent&& event,
    std::function<bool(::grpc::Status,
                        std::unique_ptr<google::protobuf::Arena> &&,
                        const grpcagent::BlockedLoopEvent&,
                        grpcagent::EventResponse*)>&& result_callback) noexcept;


  static int DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::UnblockedLoopEvent&& event,
    std::function<bool(::grpc::Status,
                        std::unique_ptr<google::protobuf::Arena> &&,
                        const grpcagent::UnblockedLoopEvent&,
                        grpcagent::EventResponse*)>&& result_callback) noexcept;

  static int DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::ExitEvent&& event,
    std::function<bool(::grpc::Status,
                        std::unique_ptr<google::protobuf::Arena> &&,
                        const grpcagent::ExitEvent&,
                        grpcagent::EventResponse*)>&& result_callback) noexcept;


  static int DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::InfoEvent&& event,
    std::function<bool(::grpc::Status,
                        std::unique_ptr<google::protobuf::Arena> &&,
                        const grpcagent::InfoEvent&,
                        grpcagent::EventResponse*)>&& result_callback) noexcept;


  static int DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::MetricsEvent&& event,
    std::function<bool(::grpc::Status,
                        std::unique_ptr<google::protobuf::Arena> &&,
                        const grpcagent::MetricsEvent&,
                        grpcagent::EventResponse*)>&& result_callback) noexcept;

  static int DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::PackagesEvent&& event,
    std::function<bool(::grpc::Status,
                        std::unique_ptr<google::protobuf::Arena> &&,
                        const grpcagent::PackagesEvent&,
                        grpcagent::EventResponse*)>&& result_callback) noexcept;

  static int DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::ReconfigureEvent&& event,
    std::function<bool(::grpc::Status,
                        std::unique_ptr<google::protobuf::Arena> &&,
                        const grpcagent::ReconfigureEvent&,
                        grpcagent::EventResponse*)>&& result_callback) noexcept;

  static int DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::SourceCodeEvent&& event,
    std::function<bool(::grpc::Status,
                        std::unique_ptr<google::protobuf::Arena> &&,
                        const grpcagent::SourceCodeEvent&,
                        grpcagent::EventResponse*)>&& result_callback) noexcept;

  static int DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::StartupTimesEvent&& event,
    std::function<bool(::grpc::Status,
                        std::unique_ptr<google::protobuf::Arena> &&,
                        const grpcagent::StartupTimesEvent&,
                        grpcagent::EventResponse*)>&& result_callback) noexcept;
};

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_GRPC_CLIENT_H_
