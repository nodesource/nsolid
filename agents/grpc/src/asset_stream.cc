#include "asset_stream.h"
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

AssetStream::AssetStream(
    NSolidService::StubInterface* stub,
    AssetStor&& stor,
    std::weak_ptr<AssetStreamObserver> observer,
    const std::string& agent_id,
    const std::string& saas,
    AssetStreamRpcType rpc_type): observer_(observer),
                                  stor_(std::move(stor)) {
  ASSERT_EQ(0, lock_.init(true));
  context_.AddMetadata("nsolid-agent-id", agent_id);
  if (!saas.empty()) {
    context_.AddMetadata("nsolid-saas-token", saas);
  }

  // Call the appropriate RPC method based on the rpc_type parameter
  if (rpc_type == EXPORT_CONTINUOUS_PROFILE) {
    stub->async()->ExportContinuousProfile(&context_, &event_response_, this);
  } else {
    stub->async()->ExportAsset(&context_, &event_response_, this);
  }

  AddHold();
  StartCall();
}

AssetStream::~AssetStream() {
}

void AssetStream::OnDone(const Status& s) {
  if (!s.ok()) {
    Debug("AssetStream::OnDone error: %d. %s:%s\n",
          s.error_code(),
          s.error_message().c_str(),
          s.error_details().c_str());
  }

  auto obs = observer_.lock();
  if (obs == nullptr) {
    delete this;
    return;
  }

  stor_.stream = this;
  obs->on_asset_stream_done(s, std::move(stor_));
}

void AssetStream::OnWriteDone(bool ok/*ok*/) {
  nsuv::ns_mutex::scoped_lock lock(lock_);
  write_state_.write_done = true;
  if (!ok) {
    Debug("AssetStream::OnWriteDone not ok\n");
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
      StartWrite(&write_state_.asset);
      write_state_.write_done = false;
    } else if (write_state_.write_done_called) {
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
  nsuv::ns_mutex::scoped_lock lock(lock_);
  ASSERT(write_state_.write_done_called == false);
  write_state_.write_done_called = true;
  NextWrite();
}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node
