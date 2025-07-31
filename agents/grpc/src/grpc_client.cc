#include "grpc_client.h"
#include "debug_utils-inl.h"
#include "opentelemetry/exporters/otlp/otlp_grpc_client_options.h"

using grpc::Channel;
using grpc::ChannelArguments;
using grpc::ClientContext;
using grpc::CreateCustomChannel;
using grpc::InsecureChannelCredentials;
using grpc::SslCredentials;
using grpc::SslCredentialsOptions;
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

/**
  * Create gRPC channel.
  */
std::shared_ptr<Channel>
    GrpcClient::MakeChannel(const OtlpGrpcClientOptions& options) {
  std::shared_ptr<Channel> channel;
  ChannelArguments grpc_arguments;
  // Configure the keepalive of the Client Channel. The keepalive time period is
  // set to 30 seconds, with a timeout of 15 seconds. Additionally, pings will
  // be sent even if there are no calls nor headers/data in flight on an active
  // connection. Important: these settings should match the ones configured
  // server-side.
  grpc_arguments.SetInt(GRPC_ARG_KEEPALIVE_TIME_MS, 30 * 1000 /* 30 sec*/);
  grpc_arguments.SetInt(GRPC_ARG_KEEPALIVE_TIMEOUT_MS, 15 * 1000 /* 15 sec*/);
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

}  // namespace grpc
}  // namespace nsolid
}  // namespace node
