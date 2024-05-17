#ifndef AGENTS_GRPC_SRC_GRPC_AGENT_H_
#define AGENTS_GRPC_SRC_GRPC_AGENT_H_

#include <nsolid/nsolid_api.h>
#include <memory>
#include <grpcpp/channel.h>
#include "nsolid_service.grpc.pb.h"

namespace node {
namespace nsolid {
namespace grpc {

// predeclarations
class GrpcAgent;

using SharedGrpcAgent = std::shared_ptr<GrpcAgent>;
using WeakGrpcAgent = std::weak_ptr<GrpcAgent>;

class NSolidServiceClient {
 public:
  NSolidServiceClient() {};
  ~NSolidServiceClient() = default;

 private:
  std::unique_ptr<::grpc::Channel> channel_;
  std::unique_ptr<grpcagent::NSolidService::Stub> stub_;
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

  static void env_msg_cb(nsuv::ns_async*, WeakGrpcAgent);

  static void shutdown_cb_(nsuv::ns_async*, WeakGrpcAgent);

  static void config_msg_cb_(nsuv::ns_async*, WeakGrpcAgent);

  static void receiver_(nsuv::ns_thread*, WeakGrpcAgent);

  void do_start();

  void do_stop();

 private:
  uv_loop_t loop_;
  nsuv::ns_thread thread_;
  nsuv::ns_async shutdown_;

  // For the grpc response handling
  nsuv::ns_async grpc_receiver_thread_;

  // For thread start/stop synchronization
  std::atomic<bool> ready_;
  uv_cond_t start_cond_;
  uv_mutex_t start_lock_;

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
