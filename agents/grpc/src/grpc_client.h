#ifndef AGENTS_GRPC_SRC_GRPC_CLIENT_H_
#define AGENTS_GRPC_SRC_GRPC_CLIENT_H_

#include <grpcpp/grpcpp.h>
#include "./proto/nsolid_service.grpc.pb.h"
#include "nsolid/thread_safe.h"

namespace node {
namespace nsolid {
namespace grpc {

// predeclarations
class GrpcAgent;

class CommandStream: public ::grpc::ClientBidiReactor<grpcagent::CommandResponse, grpcagent::CommandRequest> {

  struct WriteState {
    bool write_done = true;
    grpcagent::CommandResponse resp;
  };

 public:
  explicit CommandStream(grpcagent::NSolidService::StubInterface* stub,
                         std::shared_ptr<GrpcAgent> agent);

  ~CommandStream();

  void OnDone(const ::grpc::Status& /*s*/) override;

  void OnReadDone(bool ok) override;

  void OnWriteDone(bool /*ok*/) override;

  void Write(grpcagent::CommandResponse&& resp);

 private:

  void NextWrite();

 private:
  std::shared_ptr<GrpcAgent> agent_;
  ::grpc::ClientContext context_;
  grpcagent::CommandRequest server_request_;
  WriteState write_state_;
  TSQueue<grpcagent::CommandResponse> response_q_;
};

class AssetStream: public ::grpc::ClientWriteReactor<grpcagent::Asset> {

  struct WriteState {
    bool write_done = true;
    grpcagent::Asset asset;
  };

 public:
  explicit AssetStream(grpcagent::NSolidService::StubInterface* stub,
                       std::shared_ptr<GrpcAgent> agent,
                       const std::string& req_id);

  ~AssetStream();

  void OnDone(const ::grpc::Status& /*s*/) override;

  void OnWriteDone(bool /*ok*/);

  void Write(grpcagent::Asset&& resp);

 private:

  void NextWrite();

 private:
  std::shared_ptr<GrpcAgent> agent_;
  ::grpc::ClientContext context_;
  grpcagent::EventResponse event_response_;
  WriteState write_state_;
  TSQueue<grpcagent::Asset> assets_q_;
  std::string req_id_;
};

class GrpcClient {
 public:
  GrpcClient();

  ~GrpcClient();

  /**
   * Create gRPC channel.
   */
  static std::shared_ptr<::grpc::Channel> MakeChannel();

  /**
   * Create gRPC client context to call RPC.
   */
  static std::unique_ptr<::grpc::ClientContext> MakeClientContext(const std::string& agent_id,
                                                                  const std::string& saas);

  /**
   * Create N|Solid service stub to communicate with the N|Solid Console.
   */
  static std::unique_ptr<grpcagent::NSolidService::StubInterface> MakeNSolidServiceStub();

  int DelegateAsyncExport(
      grpcagent::NSolidService::StubInterface* stub,
      std::unique_ptr<::grpc::ClientContext>&& context,
      std::unique_ptr<google::protobuf::Arena>&& arena,
      grpcagent::BlockedLoopEvent&& event,
      std::function<bool(::grpc::Status,
                         std::unique_ptr<google::protobuf::Arena> &&,
                         const grpcagent::BlockedLoopEvent&,
                         grpcagent::EventResponse*)>&& result_callback) noexcept;


  int DelegateAsyncExport(
      grpcagent::NSolidService::StubInterface* stub,
      std::unique_ptr<::grpc::ClientContext>&& context,
      std::unique_ptr<google::protobuf::Arena>&& arena,
      grpcagent::UnblockedLoopEvent&& event,
      std::function<bool(::grpc::Status,
                         std::unique_ptr<google::protobuf::Arena> &&,
                         const grpcagent::UnblockedLoopEvent&,
                         grpcagent::EventResponse*)>&& result_callback) noexcept;


  int DelegateAsyncExport(
      grpcagent::NSolidService::StubInterface* stub,
      std::unique_ptr<::grpc::ClientContext>&& context,
      std::unique_ptr<google::protobuf::Arena>&& arena,
      grpcagent::InfoEvent&& event,
      std::function<bool(::grpc::Status,
                         std::unique_ptr<google::protobuf::Arena> &&,
                         const grpcagent::InfoEvent&,
                         grpcagent::EventResponse*)>&& result_callback) noexcept;

  int DelegateAsyncExport(
      grpcagent::NSolidService::StubInterface* stub,
      std::unique_ptr<::grpc::ClientContext>&& context,
      std::unique_ptr<google::protobuf::Arena>&& arena,
      grpcagent::PackagesEvent&& event,
      std::function<bool(::grpc::Status,
                         std::unique_ptr<google::protobuf::Arena> &&,
                         const grpcagent::PackagesEvent&,
                         grpcagent::EventResponse*)>&& result_callback) noexcept;

  int DelegateAsyncExport(
      grpcagent::NSolidService::StubInterface* stub,
      std::unique_ptr<::grpc::ClientContext>&& context,
      std::unique_ptr<google::protobuf::Arena>&& arena,
      grpcagent::ReconfigureEvent&& event,
      std::function<bool(::grpc::Status,
                         std::unique_ptr<google::protobuf::Arena> &&,
                         const grpcagent::ReconfigureEvent&,
                         grpcagent::EventResponse*)>&& result_callback) noexcept;
};

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_GRPC_CLIENT_H_
