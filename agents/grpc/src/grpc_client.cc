#include "grpc_client.h"
#include "debug_utils-inl.h"
#include "opentelemetry/exporters/otlp/otlp_grpc_client_options.h"
#include <grpcpp/security/tls_credentials_options.h>

using ::grpc::Channel;
using ::grpc::ChannelArguments;
using ::grpc::ClientContext;
using ::grpc::CreateCustomChannel;
using ::grpc::InsecureChannelCredentials;
using ::grpc::SslCredentials;
using ::grpc::SslCredentialsOptions;
// The following experimental gRPC TLS APIs are required for TLS session key
// logging (via set_tls_session_key_log_file_path), which is not currently
// supported by the stable SslCredentials API.
// These APIs are subject to change in future gRPC releases. This project
// currently pins gRPC to version 1.76.0
// (see deps/grpc/include/grpcpp/version_info.h).
using ::grpc::experimental::IdentityKeyCertPair;
using ::grpc::experimental::TlsCredentials;
using ::grpc::experimental::TlsChannelCredentialsOptions;
using ::grpc::experimental::StaticDataCertificateProvider;
using grpcagent::NSolidService;
using opentelemetry::v1::exporter::otlp::OtlpGrpcClientOptions;

namespace node {
namespace nsolid {
namespace grpc {

/**
  * Create gRPC channel credentials.
  */
std::shared_ptr<::grpc::ChannelCredentials>
    GrpcClient::MakeCredentials(const OtlpGrpcClientOptions& options,
                                const std::string& tls_keylog_file) {
  if (!options.use_ssl_credentials) {
    return InsecureChannelCredentials();
  }

  if (!tls_keylog_file.empty()) {
    TlsChannelCredentialsOptions tls_opts;
    if (!options.ssl_credentials_cacert_as_string.empty()) {
      auto cert_provider = std::make_shared<StaticDataCertificateProvider>(
          options.ssl_credentials_cacert_as_string,
          std::vector<IdentityKeyCertPair>());
      tls_opts.set_certificate_provider(cert_provider);
      tls_opts.watch_root_certs();
    }
    tls_opts.set_tls_session_key_log_file_path(tls_keylog_file);
    return TlsCredentials(tls_opts);
  }

  SslCredentialsOptions ssl_opts;
  ssl_opts.pem_root_certs = options.ssl_credentials_cacert_as_string;
  return SslCredentials(ssl_opts);
}

/**
  * Create gRPC channel.
  */
std::shared_ptr<Channel>
    GrpcClient::MakeChannel(const OtlpGrpcClientOptions& options,
                            const std::string& tls_keylog_file) {
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

  static const auto kServiceConfigJson = std::string_view{R"(
  {
    "methodConfig": [
      {
        "name": [{}],
        "retryPolicy": {
          "maxAttempts": %0000000000u,
          "initialBackoff": "%0000000000.1fs",
          "maxBackoff": "%0000000000.1fs",
          "backoffMultiplier": %0000000000.1f,
          "retryableStatusCodes": [
            "UNAVAILABLE"
          ]
        }
      }
    ]
  })"};

  // Allocate string with buffer large enough to hold the formatted json config
  auto service_config = std::string(kServiceConfigJson.size(), '\0');
  float initial_backoff = options.retry_policy_initial_backoff.count();
  float max_backoff = options.retry_policy_max_backoff.count();
  float backoff_multiplier = options.retry_policy_backoff_multiplier;
  std::snprintf(
    service_config.data(),
    service_config.size(),
    kServiceConfigJson.data(),
    options.retry_policy_max_attempts,
    std::min(std::max(initial_backoff, 0.f), 999999999.f),
    std::min(std::max(max_backoff, 0.f), 999999999.f),
    std::min(std::max(backoff_multiplier, 0.f), 999999999.f));

  grpc_arguments.SetServiceConfigJSON(service_config);

  return CreateCustomChannel(options.endpoint,
                             MakeCredentials(options, tls_keylog_file),
                             grpc_arguments);
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
    GrpcClient::MakeNSolidServiceStub(const OtlpGrpcClientOptions& options,
                                      const std::string& tls_keylog_file) {
  return NSolidService::NewStub(MakeChannel(options, tls_keylog_file));
}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node
