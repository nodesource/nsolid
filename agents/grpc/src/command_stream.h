#ifndef AGENTS_GRPC_SRC_COMMAND_STREAM_H_
#define AGENTS_GRPC_SRC_COMMAND_STREAM_H_

#include "./proto/nsolid_service.grpc.pb.h"
#include "grpcpp/grpcpp.h"
#include "nsolid/thread_safe.h"
#include "nsuv-inl.h"

namespace node {
namespace nsolid {
namespace grpc {

class CommandStreamObserver {
 public:
  virtual ~CommandStreamObserver() = default;

  virtual void on_command_received(grpcagent::CommandRequest&&) = 0;
  virtual void on_command_stream_done(const ::grpc::Status&) = 0;
};

class CommandStream:
  public ::grpc::ClientBidiReactor<grpcagent::CommandResponse,
                                   grpcagent::CommandRequest> {
  struct WriteState {
    bool write_done = true;
    bool writes_done = false;
    bool done = false;
    grpcagent::CommandResponse resp;
  };

 public:
  explicit CommandStream(grpcagent::NSolidService::StubInterface* stub,
                         std::weak_ptr<CommandStreamObserver> observer,
                         const std::string& agent_id,
                         const std::string& saas);

  ~CommandStream();

  void OnDone(const ::grpc::Status& /*s*/) override;

  void OnReadDone(bool ok) override;

  void OnWriteDone(bool /*ok*/) override;

  void Write(grpcagent::CommandResponse&& resp);

  bool is_done() const {
    nsuv::ns_mutex::scoped_lock lock(lock_);
    return write_state_.done;
  }

 private:
  void NextWrite();

 private:
  std::weak_ptr<CommandStreamObserver> observer_;
  ::grpc::ClientContext context_;
  grpcagent::CommandRequest server_request_;
  WriteState write_state_;
  TSQueue<grpcagent::CommandResponse> response_q_;
  nsuv::ns_mutex lock_;
  uv_cond_t on_done_cond_;
  bool cancelling_for_destruction_ = false;
};

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_COMMAND_STREAM_H_
