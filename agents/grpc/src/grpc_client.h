#ifndef AGENTS_GRPC_SRC_GRPC_CLIENT_H_
#define AGENTS_GRPC_SRC_GRPC_CLIENT_H_

#include "asserts-cpp/asserts.h"
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

using google::protobuf::Arena;
using opentelemetry::v1::exporter::otlp::OtlpGrpcClientOptions;

namespace node {
namespace nsolid {
namespace grpc {

// Template class for managing async call data for DelegateAsyncExport
// Moved from grpc_client.cc so it is visible to all template instantiations

template <class EventType>
class GrpcAsyncCallData {
 public:
  std::unique_ptr<google::protobuf::Arena> arena;
  ::grpc::Status grpc_status;
  std::unique_ptr<::grpc::ClientContext> grpc_context;

  std::function<bool(::grpc::Status,
                     std::unique_ptr<google::protobuf::Arena>&&,
                     const EventType&,
                     grpcagent::EventResponse*)> result_callback;

  EventType* event = nullptr;
  grpcagent::EventResponse* event_response = nullptr;

  GrpcAsyncCallData() = default;
  ~GrpcAsyncCallData() = default;

  GrpcAsyncCallData(const GrpcAsyncCallData&)            = delete;
  GrpcAsyncCallData& operator=(const GrpcAsyncCallData&) = delete;
  GrpcAsyncCallData(GrpcAsyncCallData&&)                 = delete;
  GrpcAsyncCallData& operator=(GrpcAsyncCallData&&)      = delete;
};

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

  /**
   * Generic DelegateAsyncExport for any event type.
   * Usage example:
   *   GrpcClient::DelegateAsyncExport<EventType>(
   *     stub,
   *     &grpcagent::NSolidService::StubInterface::async_interface::ExportEventType,
   *     std::move(context),
   *     std::move(arena),
   *     std::move(event),
   *     std::move(callback));
   */
  template <typename EventT>
  static int DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    void(grpcagent::NSolidService::StubInterface::async_interface::*exportFunc)(
        ::grpc::ClientContext*,
        const EventT*,
        ::grpcagent::EventResponse*,
        std::function<void(::grpc::Status)>),
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    EventT&& event,
    std::function<bool(::grpc::Status,
                      std::unique_ptr<google::protobuf::Arena>&&,
                      const EventT&,
                      grpcagent::EventResponse*)>&& result_callback) {
    ASSERT_NOT_NULL(stub);
    auto call_data = std::make_shared<GrpcAsyncCallData<EventT>>();
    call_data->arena.swap(arena);
    call_data->result_callback.swap(result_callback);
    call_data->event = Arena::Create<EventT>(call_data->arena.get(),
                                             std::move(event));
    call_data->event_response =
      Arena::Create<grpcagent::EventResponse>(call_data->arena.get());
    if (call_data->event == nullptr || call_data->event_response == nullptr) {
      return -1;
    }

    call_data->grpc_context.swap(context);

    // Call the correct async export method on the stub
    (stub->async()->*exportFunc)(call_data->grpc_context.get(),
                                 call_data->event,
                                 call_data->event_response,
                                 [call_data](::grpc::Status status) {
        call_data->grpc_status = status;
        call_data->result_callback(call_data->grpc_status,
                                   std::move(call_data->arena),
                                   *call_data->event,
                                   call_data->event_response);
      });

    return 0;
  }
};

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_GRPC_CLIENT_H_
