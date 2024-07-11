#include "grpc_client.h"
#include "grpc_agent.h"

namespace node {
namespace nsolid {
namespace grpc {

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

  GrpcAsyncCallData() {}
  ~GrpcAsyncCallData() {}
};

CommandStream::CommandStream(grpcagent::NSolidService::StubInterface* stub,
                             std::shared_ptr<GrpcAgent> agent): agent_(agent) {
  stub->async()->Command(&context_, this);
  StartRead(&server_request_);
  StartCall();
 }

CommandStream::~CommandStream() {
}

void CommandStream::OnDone(const ::grpc::Status& s) {
  fprintf(stderr, "OnDone: %d. %s:%s\n", s.error_code(), s.error_message().c_str(), s.error_details().c_str());
}

void CommandStream::OnReadDone(bool ok) {
  if (ok) {
    fprintf(stderr, "OnReadDone\n");
    fprintf(stderr, "Command: %s\n", server_request_.command().c_str());
    agent_->got_command_request(std::move(server_request_));
    // Write(grpcagent::CommandResponse());
    StartRead(&server_request_);
  }
}

void CommandStream::OnWriteDone(bool ok/*ok*/) {
  fprintf(stderr, "OnWriteDone: %d\n", ok);
  write_state_.write_done = true;
  NextWrite();
}

void CommandStream::NextWrite() {
  grpcagent::CommandResponse response;
  if (write_state_.write_done && response_q_.dequeue(write_state_.resp)) {
    StartWrite(&write_state_.resp);
    write_state_.write_done = false;
  }
}

void CommandStream::Write(grpcagent::CommandResponse&& resp) {
  response_q_.enqueue(std::move(resp));
  NextWrite(); 
}

GrpcClient::GrpcClient() {
}

GrpcClient::~GrpcClient() {
}

/**
  * Create gRPC channel.
  */
std::shared_ptr<::grpc::Channel> GrpcClient::MakeChannel() {
  std::shared_ptr<::grpc::Channel> channel;
  ::grpc::ChannelArguments grpc_arguments;
  channel = ::grpc::CreateCustomChannel("localhost:50051", ::grpc::InsecureChannelCredentials(), grpc_arguments);
  return channel;
}

/**
  * Create gRPC client context to call RPC.
  */
std::unique_ptr<::grpc::ClientContext> GrpcClient::MakeClientContext(const std::string& agent_id,
                                                                     const std::string& saas) {
  std::unique_ptr<::grpc::ClientContext> context = std::make_unique<::grpc::ClientContext>();
  context->AddMetadata("NSOLID-AGENT-ID", agent_id);
  context->AddMetadata("NSOLID-SAAS-TOKEN", saas);
  return context;
}

/**
  * Create N|Solid service stub to communicate with the N|Solid Console.
  */
std::unique_ptr<grpcagent::NSolidService::StubInterface> GrpcClient::MakeNSolidServiceStub() {
  return grpcagent::NSolidService::NewStub(MakeChannel());
}

template <class EventType>
static int InternalDelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    void (grpcagent::NSolidService::StubInterface::async_interface::*exportFunc)(
        ::grpc::ClientContext*, const EventType*, ::grpcagent::EventResponse*, std::function<void(::grpc::Status)>), // Function pointer type
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    EventType&& event,
    std::function<bool(::grpc::Status,
                       std::unique_ptr<google::protobuf::Arena> &&,
                       const EventType&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {

  auto call_data = std::make_shared<GrpcAsyncCallData<EventType>>();
  call_data->arena.swap(arena);
  call_data->result_callback.swap(result_callback);

  call_data->event =
      google::protobuf::Arena::Create<EventType>(call_data->arena.get(), std::move(event));
  call_data->event_response = google::protobuf::Arena::Create<grpcagent::EventResponse>(call_data->arena.get());
  if (call_data->event == nullptr || call_data->event_response == nullptr) {
    assert(0);
  }

  call_data->grpc_context.swap(context);

  (stub->async()
      ->*exportFunc)(call_data->grpc_context.get(), call_data->event, call_data->event_response,
    [call_data](::grpc::Status grpc_status) {
      call_data->grpc_status = grpc_status;
      if (call_data->grpc_status.ok())
      {
        fprintf(stderr, "InternalDelegateAsyncExport() success\n");
      }
      
      call_data->result_callback(call_data->grpc_status, std::move(call_data->arena), *call_data->event, call_data->event_response);
    });
  return 0;
}


int GrpcClient::DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::BlockedLoopEvent&& event,
    std::function<bool(::grpc::Status,
                       std::unique_ptr<google::protobuf::Arena> &&,
                       const grpcagent::BlockedLoopEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::BlockedLoopEvent>(
      stub,
      &grpcagent::NSolidService::StubInterface::async_interface::ExportBlockedLoop,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}


int GrpcClient::DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::UnblockedLoopEvent&& event,
    std::function<bool(::grpc::Status,
                       std::unique_ptr<google::protobuf::Arena> &&,
                       const grpcagent::UnblockedLoopEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::UnblockedLoopEvent>(
      stub,
      &grpcagent::NSolidService::StubInterface::async_interface::ExportUnblockedLoop,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}


int GrpcClient::DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::InfoEvent&& event,
    std::function<bool(::grpc::Status,
                       std::unique_ptr<google::protobuf::Arena> &&,
                       const grpcagent::InfoEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::InfoEvent>(
      stub,
      &grpcagent::NSolidService::StubInterface::async_interface::ExportInfo,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}


int GrpcClient::DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::PackagesEvent&& event,
    std::function<bool(::grpc::Status,
                       std::unique_ptr<google::protobuf::Arena> &&,
                       const grpcagent::PackagesEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::PackagesEvent>(
      stub,
      &grpcagent::NSolidService::StubInterface::async_interface::ExportPackages,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}


int GrpcClient::DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::ReconfigureEvent&& event,
    std::function<bool(::grpc::Status,
                       std::unique_ptr<google::protobuf::Arena> &&,
                       const grpcagent::ReconfigureEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::ReconfigureEvent>(
      stub,
      &grpcagent::NSolidService::StubInterface::async_interface::ExportReconfigure,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node
