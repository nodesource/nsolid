#ifndef AGENTS_GRPC_SRC_GRPC_AGENT_H_
#define AGENTS_GRPC_SRC_GRPC_AGENT_H_

#include <nsolid/nsolid_api.h>
#include <memory>
#include <grpcpp/channel.h>
#include <grpcpp/client_context.h>
#include "nsolid_service.grpc.pb.h"

namespace node {
namespace nsolid {
namespace grpc {

// predeclarations
class GrpcAgent;
class NSolidMessenger;

using SharedGrpcAgent = std::shared_ptr<GrpcAgent>;
using WeakGrpcAgent = std::weak_ptr<GrpcAgent>;

class NSolidServiceClient {
 public:
  NSolidServiceClient();

  ~NSolidServiceClient() = default;

 private:
  std::shared_ptr<::grpc::Channel> channel_;
  std::unique_ptr<grpcagent::NSolidService::Stub> stub_;
  std::unique_ptr<NSolidMessenger> messenger_;
};

class NSolidMessenger: public ::grpc::ClientBidiReactor<grpcagent::RuntimeResponse, grpcagent::RuntimeRequest> {

  struct WriteState {
    grpcagent::RuntimeResponse resp;
    bool write_done = true;
  };

 public:
  explicit NSolidMessenger(grpcagent::NSolidService::Stub* stub);

  ~NSolidMessenger() = default;

  void OnReadDone(bool ok) override;

  void OnWriteDone(bool /*ok*/) override;

  void WriteInfoMsg(const char* req_id = nullptr);

private:
  grpcagent::RuntimeResponse CreateInfoMsg(const char* req_id);

  void NextWrite();

  void Write(grpcagent::RuntimeResponse&& resp);

 private:
  ::grpc::ClientContext context_;
  grpcagent::RuntimeRequest server_request_;

  TSQueue<grpcagent::RuntimeResponse> response_q_;
  WriteState write_state_;
};

class GrpcAgent: public std::enable_shared_from_this<GrpcAgent> {
 public:
  static SharedGrpcAgent Inst();

  int start();

  int stop();

 private:
  GrpcAgent();

  ~GrpcAgent();

  static void run_(nsuv::ns_thread*, WeakGrpcAgent);

  static void config_agent_cb(std::string, WeakGrpcAgent);

  static void config_msg_cb_(nsuv::ns_async*, WeakGrpcAgent);

  static void env_creation_cb(SharedEnvInst, WeakGrpcAgent);

  static void env_deletion_cb(SharedEnvInst, WeakGrpcAgent);

  static void env_msg_cb(nsuv::ns_async*, WeakGrpcAgent);

  static void shutdown_cb_(nsuv::ns_async*, WeakGrpcAgent);

  int config(const json& config);

  void do_start();

  void do_stop();

 private:
  uv_loop_t loop_;
  nsuv::ns_thread thread_;
  nsuv::ns_async shutdown_;

  // For thread start/stop synchronization
  bool hooks_init_;
  std::atomic<bool> ready_;
  uv_cond_t start_cond_;
  uv_mutex_t start_lock_;
  nsuv::ns_rwlock stop_lock_;

  nsuv::ns_async env_msg_;
  TSQueue<std::tuple<SharedEnvInst, bool>> env_msg_q_;

  // For the Configuration API
  nsuv::ns_async config_msg_;
  TSQueue<nlohmann::json> config_msg_q_;
  nlohmann::json config_;

  // For the grpc client
  std::unique_ptr<NSolidServiceClient> client_;
};

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_GRPC_AGENT_H_
