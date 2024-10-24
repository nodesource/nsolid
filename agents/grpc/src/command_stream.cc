#include "command_stream.h"
#include "debug_utils-inl.h"
#include "asserts-cpp/asserts.h"

using grpc::Status;
using grpcagent::NSolidService;

namespace node {
namespace nsolid {
namespace grpc {

template <typename... Args>
inline void Debug(Args&&... args) {
  per_process::Debug(DebugCategory::NSOLID_GRPC_AGENT,
                     std::forward<Args>(args)...);
}

CommandStream::CommandStream(NSolidService::StubInterface* stub,
                             std::weak_ptr<CommandStreamObserver> observer,
                             const std::string& agent_id,
                             const std::string& saas): observer_(observer) {
  ASSERT_EQ(0, lock_.init(true));
  ASSERT_EQ(0, uv_cond_init(&on_done_cond_));
  context_.AddMetadata("nsolid-agent-id", agent_id);
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
  nsuv::ns_mutex::scoped_lock lock(lock_);
  // try cancel and wait until OnDone is called
  if (!write_state_.done) {
    context_.TryCancel();
  }

  do {
    uv_cond_wait(&on_done_cond_, lock_.base());
  } while (!write_state_.done);

  uv_cond_destroy(&on_done_cond_);
}

void CommandStream::OnDone(const Status& s) {
  if (!s.ok()) {
    Debug("CommandStream::OnDone error: %d. %s:%s\n",
          s.error_code(),
          s.error_message().c_str(),
          s.error_details().c_str());
  }

  auto obs = observer_.lock();
  {
    nsuv::ns_mutex::scoped_lock lock(lock_);
    write_state_.done = true;
    if (!obs) {
      uv_cond_signal(&on_done_cond_);
      return;
    }
  }

  // Don't notify the observer if the stream was cancelled (destroyed)
  obs->on_command_stream_done(s);
}

void CommandStream::OnReadDone(bool ok) {
  if (ok) {
    auto obs = observer_.lock();
    if (obs) {
      obs->on_command_received(std::move(server_request_));
      StartRead(&server_request_);
      return;
    }
  } else {
    Debug("CommandStream::OnReadDone not ok\n");
  }

  StartWritesDone();
  RemoveHold();
}

void CommandStream::OnWriteDone(bool ok/*ok*/) {
  nsuv::ns_mutex::scoped_lock lock(lock_);
  write_state_.write_done = true;
  if (!ok) {
    Debug("CommandStream::OnWriteDone not ok\n");
    StartWritesDone();
    RemoveHold();
  } else {
    NextWrite();
  }
}

void CommandStream::NextWrite() {
  if (write_state_.write_done && response_q_.dequeue(write_state_.resp)) {
    StartWrite(&write_state_.resp);
    write_state_.write_done = false;
  }
}

void CommandStream::Write(grpcagent::CommandResponse&& resp) {
  response_q_.enqueue(std::move(resp));
  nsuv::ns_mutex::scoped_lock lock(lock_);
  NextWrite();
}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node
