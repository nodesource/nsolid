#include "grpc_client.h"
#include "debug_utils-inl.h"
#include "opentelemetry/exporters/otlp/otlp_grpc_client_options.h"

using google::protobuf::Arena;
using grpc::Channel;
using grpc::ChannelArguments;
using grpc::ClientContext;
using grpc::CreateCustomChannel;
using grpc::InsecureChannelCredentials;
using grpc::SslCredentials;
using grpc::SslCredentialsOptions;
using grpc::Status;
using grpcagent::NSolidService;
using opentelemetry::v1::exporter::otlp::OtlpGrpcClientOptions;

namespace node {
namespace nsolid {
namespace grpc {

template <typename... Args>
inline void Debug(Args&&... args) {
  per_process::Debug(DebugCategory::NSOLID_GRPC_AGENT,
                     std::forward<Args>(args)...);
}

template <class EventType>
class GrpcAsyncCallData {
 public:
  std::unique_ptr<Arena> arena;
  Status grpc_status;
  std::unique_ptr<ClientContext> grpc_context;

  std::function<bool(Status,
                     std::unique_ptr<Arena>&&,
                     const EventType&,
                     grpcagent::EventResponse*)> result_callback;

  EventType* event = nullptr;
  grpcagent::EventResponse* event_response = nullptr;

  GrpcAsyncCallData() {}
  ~GrpcAsyncCallData() {}
};

/**
  * Create gRPC channel.
  */
std::shared_ptr<Channel>
    GrpcClient::MakeChannel(const OtlpGrpcClientOptions& options) {
  std::shared_ptr<Channel> channel;
  ChannelArguments grpc_arguments;
  // Configure the keepalive of the Client Channel. The keepalive time period is
  // set to 20 seconds, with a timeout of 10 seconds. Additionally, pings will
  // be sent even if there are no calls in flight on an active connection.
  grpc_arguments.SetInt(GRPC_ARG_KEEPALIVE_TIME_MS, 20 * 1000 /*20 sec*/);
  grpc_arguments.SetInt(GRPC_ARG_KEEPALIVE_TIMEOUT_MS, 10 * 1000 /*10 sec*/);
  grpc_arguments.SetInt(GRPC_ARG_KEEPALIVE_PERMIT_WITHOUT_CALLS, 1);
  grpc_arguments.SetInt(GRPC_ARG_HTTP2_MAX_PINGS_WITHOUT_DATA, 0);
  if (!options.use_ssl_credentials) {
    channel = CreateCustomChannel(options.endpoint,
                                  InsecureChannelCredentials(),
                                  grpc_arguments);
    return channel;
  }


  SslCredentialsOptions ssl_opts;
  ssl_opts.pem_root_certs = options.ssl_credentials_cacert_as_string;
  auto channel_creds = SslCredentials(ssl_opts);
  channel = CreateCustomChannel(options.endpoint,
                                channel_creds,
                                grpc_arguments);
  return channel;
}

/**
  * Create gRPC client context to call RPC.
  */
std::unique_ptr<ClientContext>
GrpcClient::MakeClientContext(const std::string& agent_id,
                              const std::string& saas) {
  std::unique_ptr<ClientContext> context = std::make_unique<ClientContext>();
  context->AddMetadata("nsolid-agent-id", agent_id);
  if (!saas.empty()) {
    context->AddMetadata("nsolid-saas-token", saas);
  }

  return context;
}

/**
  * Create N|Solid service stub to communicate with the N|Solid Console.
  */
std::unique_ptr<NSolidService::StubInterface>
    GrpcClient::MakeNSolidServiceStub(const OtlpGrpcClientOptions& options) {
  return NSolidService::NewStub(MakeChannel(options));
}

template <class EventType>
static int InternalDelegateAsyncExport(
    NSolidService::StubInterface* stub,
    void(NSolidService::StubInterface::async_interface::*exportFunc)(
        ClientContext*,
        const EventType*,
        ::grpcagent::EventResponse*,
        std::function<void(Status)>),
    std::unique_ptr<ClientContext>&& context,
    std::unique_ptr<Arena>&& arena,
    EventType&& event,
    std::function<bool(Status,
                       std::unique_ptr<Arena> &&,
                       const EventType&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  auto call_data = std::make_shared<GrpcAsyncCallData<EventType>>();
  call_data->arena.swap(arena);
  call_data->result_callback.swap(result_callback);

  call_data->event = Arena::Create<EventType>(call_data->arena.get(),
                                              std::move(event));
  call_data->event_response =
    Arena::Create<grpcagent::EventResponse>(call_data->arena.get());
  if (call_data->event == nullptr || call_data->event_response == nullptr) {
    assert(0);
  }

  call_data->grpc_context.swap(context);

  (stub->async()->*exportFunc)(call_data->grpc_context.get(),
                               call_data->event,
                               call_data->event_response,
                               [call_data](Status grpc_status) {
    call_data->grpc_status = grpc_status;
    call_data->result_callback(call_data->grpc_status,
                               std::move(call_data->arena),
                               *call_data->event,
                               call_data->event_response);
  });

  return 0;
}


int GrpcClient::DelegateAsyncExport(
    NSolidService::StubInterface* stub,
    std::unique_ptr<ClientContext>&& context,
    std::unique_ptr<Arena>&& arena,
    grpcagent::BlockedLoopEvent&& event,
    std::function<bool(Status,
                       std::unique_ptr<Arena> &&,
                       const grpcagent::BlockedLoopEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::BlockedLoopEvent>(
      stub,
      &NSolidService::StubInterface::async_interface::ExportBlockedLoop,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}


int GrpcClient::DelegateAsyncExport(
    NSolidService::StubInterface* stub,
    std::unique_ptr<ClientContext>&& context,
    std::unique_ptr<Arena>&& arena,
    grpcagent::UnblockedLoopEvent&& event,
    std::function<bool(Status,
                       std::unique_ptr<Arena> &&,
                       const grpcagent::UnblockedLoopEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::UnblockedLoopEvent>(
      stub,
      &NSolidService::StubInterface::async_interface::ExportUnblockedLoop,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}


int GrpcClient::DelegateAsyncExport(
    NSolidService::StubInterface* stub,
    std::unique_ptr<ClientContext>&& context,
    std::unique_ptr<Arena>&& arena,
    grpcagent::ExitEvent&& event,
    std::function<bool(Status,
                       std::unique_ptr<Arena> &&,
                       const grpcagent::ExitEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::ExitEvent>(
      stub,
      &NSolidService::StubInterface::async_interface::ExportExit,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}


int GrpcClient::DelegateAsyncExport(
    NSolidService::StubInterface* stub,
    std::unique_ptr<ClientContext>&& context,
    std::unique_ptr<Arena>&& arena,
    grpcagent::InfoEvent&& event,
    std::function<bool(Status,
                       std::unique_ptr<Arena> &&,
                       const grpcagent::InfoEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::InfoEvent>(
      stub,
      &NSolidService::StubInterface::async_interface::ExportInfo,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}


int GrpcClient::DelegateAsyncExport(
    NSolidService::StubInterface* stub,
    std::unique_ptr<ClientContext>&& context,
    std::unique_ptr<Arena>&& arena,
    grpcagent::MetricsEvent&& event,
    std::function<bool(Status,
                       std::unique_ptr<Arena> &&,
                       const grpcagent::MetricsEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::MetricsEvent>(
      stub,
      &NSolidService::StubInterface::async_interface::ExportMetrics,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}


int GrpcClient::DelegateAsyncExport(
    NSolidService::StubInterface* stub,
    std::unique_ptr<ClientContext>&& context,
    std::unique_ptr<Arena>&& arena,
    grpcagent::PackagesEvent&& event,
    std::function<bool(Status,
                       std::unique_ptr<Arena> &&,
                       const grpcagent::PackagesEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::PackagesEvent>(
      stub,
      &NSolidService::StubInterface::async_interface::ExportPackages,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}


int GrpcClient::DelegateAsyncExport(
    NSolidService::StubInterface* stub,
    std::unique_ptr<ClientContext>&& context,
    std::unique_ptr<Arena>&& arena,
    grpcagent::ReconfigureEvent&& event,
    std::function<bool(Status,
                       std::unique_ptr<Arena> &&,
                       const grpcagent::ReconfigureEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::ReconfigureEvent>(
      stub,
      &NSolidService::StubInterface::async_interface::ExportReconfigure,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}


int GrpcClient::DelegateAsyncExport(
    NSolidService::StubInterface* stub,
    std::unique_ptr<ClientContext>&& context,
    std::unique_ptr<Arena>&& arena,
    grpcagent::SourceCodeEvent&& event,
    std::function<bool(Status,
                       std::unique_ptr<Arena> &&,
                       const grpcagent::SourceCodeEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::SourceCodeEvent>(
      stub,
      &NSolidService::StubInterface::async_interface::ExportSourceCode,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}


int GrpcClient::DelegateAsyncExport(
    NSolidService::StubInterface* stub,
    std::unique_ptr<ClientContext>&& context,
    std::unique_ptr<Arena>&& arena,
    grpcagent::StartupTimesEvent&& event,
    std::function<bool(Status,
                       std::unique_ptr<Arena> &&,
                       const grpcagent::StartupTimesEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::StartupTimesEvent>(
      stub,
      &NSolidService::StubInterface::async_interface::ExportStartupTimes,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node
