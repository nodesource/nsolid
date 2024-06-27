#include "grpc_client.h"
#include "debug_utils-inl.h"
#include "grpc_agent.h"
#include "asserts-cpp/asserts.h"
#include "opentelemetry/exporters/otlp/otlp_grpc_client_options.h"

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
  ASSERT_EQ(0, lock_.init(true));
  context_.AddMetadata("nsolid-agent-id", agent->agent_id());
  const std::string& saas = agent_->saas();
  if (!saas.empty()) {
    context_.AddMetadata("nsolid-saas-token", saas);
  }
  context_.set_wait_for_ready(true);
  stub->async()->Command(&context_, this);
  StartRead(&server_request_);
  AddHold();
  StartCall();
 }

CommandStream::~CommandStream() {
  Debug("[%ld] CommandStream::~CommandStream\n", pthread_self());
}

void CommandStream::OnDone(const ::grpc::Status& s) {
  Debug("[%ld] CommandStream::OnDone: %d. %s:%s\n", pthread_self(), s.error_code(), s.error_message().c_str(), s.error_details().c_str());
  if (agent_) {
    agent_->on_command_stream_done(s);
  }
}

void CommandStream::OnReadDone(bool ok) {
  Debug("[%ld] CommandStream::OnReadDone: %d\n", pthread_self(), ok);
  if (ok) {
    agent_->got_command_request(std::move(server_request_));
    StartRead(&server_request_);
  } else {
    StartWritesDone();
    RemoveHold();
  }
}

void CommandStream::OnWriteDone(bool ok/*ok*/) {
  Debug("[%ld] CommandStream::OnWriteDone: %d\n", pthread_self(), ok);
  nsuv::ns_mutex::scoped_lock lock(lock_);
  write_state_.write_done = true;
  if (!ok) {
    StartWritesDone();
    RemoveHold();
  } else {
    NextWrite();
  }
}

void CommandStream::NextWrite() {
  if (write_state_.write_done && response_q_.dequeue(write_state_.resp)) {
    Debug("[%ld] CommandStream::StartWrite\n", pthread_self());
    StartWrite(&write_state_.resp);
    write_state_.write_done = false;
  }
}

void CommandStream::Write(grpcagent::CommandResponse&& resp) {
  response_q_.enqueue(std::move(resp));
  nsuv::ns_mutex::scoped_lock lock(lock_);
  NextWrite(); 
}

AssetStream::AssetStream(
    grpcagent::NSolidService::StubInterface* stub,
    std::weak_ptr<GrpcAgent> agent,
    AssetStor&& stor): agent_(agent),
                       stor_(std::move(stor)) {
  ASSERT_EQ(0, lock_.init(true));
  SharedGrpcAgent agent_sp = agent_.lock();
  ASSERT(agent_sp != nullptr);
  context_.AddMetadata("nsolid-agent-id", agent_sp->agent_id());
  if (!agent_sp->saas().empty()) {
    context_.AddMetadata("nsolid-saas-token", agent_sp->saas());
  }
  stub->async()->ExportAsset(&context_, &event_response_, this);
  AddHold();
  StartCall();
 }

AssetStream::~AssetStream() {
  Debug("AssetStream::~AssetStream\n");
}

void AssetStream::OnDone(const ::grpc::Status& s) {
  Debug("AssetStream::OnDone: %d. %s:%s\n", static_cast<unsigned>(s.error_code()), s.error_message().c_str(), s.error_details().c_str());
  SharedGrpcAgent agent = agent_.lock();
  if (agent != nullptr) {
    // Don't continue with the exit procedure until all asset streams have finished.
    stor_.stream = this;
    agent->on_asset_stream_done(std::move(stor_));
  } else {
    delete this;
  }
}

void AssetStream::OnWriteDone(bool ok/*ok*/) {
  Debug("[%ld] AssetStream::OnWriteDone: %d\n", pthread_self(), ok);
  nsuv::ns_mutex::scoped_lock lock(lock_);
  write_state_.write_done = true;
  if (!ok) {
    write_state_.done = true;
    StartWritesDone();
    RemoveHold();
  } else {
    NextWrite();
  }
}

void AssetStream::NextWrite() {
  if (!write_state_.done && write_state_.write_done) {
    if (assets_q_.dequeue(write_state_.asset)) {
      Debug("[%ld] AssetStream::StartWrite\n", pthread_self());
      StartWrite(&write_state_.asset);
      write_state_.write_done = false;
    } else if (write_state_.write_done_called) {
      Debug("[%ld] AssetStream::StartWritesDone\n", pthread_self());
      StartWritesDone();
      RemoveHold();
    }
  }
}

void AssetStream::Write(grpcagent::Asset&& asset) {
  assets_q_.enqueue(std::move(asset));
  nsuv::ns_mutex::scoped_lock lock(lock_);
  NextWrite(); 
}

void AssetStream::WritesDone(bool) {
  write_state_.write_done_called = true;
}

GrpcClient::GrpcClient() {
}

GrpcClient::~GrpcClient() {
}

/**
  * Create gRPC channel.
  */
std::shared_ptr<::grpc::Channel>
    GrpcClient::MakeChannel(const OtlpGrpcClientOptions& options) {
  std::shared_ptr<::grpc::Channel> channel;
  ::grpc::ChannelArguments grpc_arguments;
  if (!options.use_ssl_credentials) {
    channel = ::grpc::CreateCustomChannel(options.endpoint, ::grpc::InsecureChannelCredentials(), grpc_arguments);
    return channel;
  }


  ::grpc::SslCredentialsOptions ssl_opts;
  ssl_opts.pem_root_certs = options.ssl_credentials_cacert_as_string;
  auto channel_creds = ::grpc::SslCredentials(ssl_opts);
  // Sample way of setting keepalive arguments on the client channel. Here we
  // are configuring a keepalive time period of 20 seconds, with a timeout of 10
  // seconds. Additionally, pings will be sent even if there are no calls in
  // flight on an active connection.
  grpc_arguments.SetInt(GRPC_ARG_KEEPALIVE_TIME_MS, 20 * 1000 /*20 sec*/);
  grpc_arguments.SetInt(GRPC_ARG_KEEPALIVE_TIMEOUT_MS, 10 * 1000 /*10 sec*/);
  grpc_arguments.SetInt(GRPC_ARG_KEEPALIVE_PERMIT_WITHOUT_CALLS, 1);
  channel = ::grpc::CreateCustomChannel(options.endpoint, channel_creds, grpc_arguments);
  return channel;
}

/**
  * Create gRPC client context to call RPC.
  */
std::unique_ptr<::grpc::ClientContext> GrpcClient::MakeClientContext(const std::string& agent_id,
                                                                     const std::string& saas) {
  std::unique_ptr<::grpc::ClientContext> context = std::make_unique<::grpc::ClientContext>();
  context->AddMetadata("nsolid-agent-id", agent_id);
  if (!saas.empty()) {
    context->AddMetadata("nsolid-saas-token", saas);
  }

  return context;
}

/**
  * Create N|Solid service stub to communicate with the N|Solid Console.
  */
std::unique_ptr<grpcagent::NSolidService::StubInterface>
    GrpcClient::MakeNSolidServiceStub(const OtlpGrpcClientOptions& options) {
  return grpcagent::NSolidService::NewStub(MakeChannel(options));
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
        // fprintf(stderr, "InternalDelegateAsyncExport() success\n");
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
    grpcagent::ExitEvent&& event,
    std::function<bool(::grpc::Status,
                       std::unique_ptr<google::protobuf::Arena> &&,
                       const grpcagent::ExitEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::ExitEvent>(
      stub,
      &grpcagent::NSolidService::StubInterface::async_interface::ExportExit,
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
    grpcagent::MetricsEvent&& event,
    std::function<bool(::grpc::Status,
                       std::unique_ptr<google::protobuf::Arena> &&,
                       const grpcagent::MetricsEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::MetricsEvent>(
      stub,
      &grpcagent::NSolidService::StubInterface::async_interface::ExportMetrics,
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


int GrpcClient::DelegateAsyncExport(
    grpcagent::NSolidService::StubInterface* stub,
    std::unique_ptr<::grpc::ClientContext>&& context,
    std::unique_ptr<google::protobuf::Arena>&& arena,
    grpcagent::StartupTimesEvent&& event,
    std::function<bool(::grpc::Status,
                       std::unique_ptr<google::protobuf::Arena> &&,
                       const grpcagent::StartupTimesEvent&,
                       grpcagent::EventResponse*)>&& result_callback) noexcept {
  return InternalDelegateAsyncExport<grpcagent::StartupTimesEvent>(
      stub,
      &grpcagent::NSolidService::StubInterface::async_interface::ExportStartupTimes,
      std::move(context),
      std::move(arena),
      std::move(event),
      std::move(result_callback));
}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node
