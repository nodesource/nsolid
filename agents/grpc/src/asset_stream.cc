#include "asset_stream.h"

#include <cinttypes>

#include "asserts-cpp/asserts.h"
#include "grpc_utils.h"
#include "uv.h"

using grpc::Status;
using grpcagent::NSolidService;

namespace node {
namespace nsolid {
namespace grpc {

AssetStream::AssetStream(
    NSolidService::StubInterface* stub,
    AssetStor&& stor,
    std::weak_ptr<AssetStreamObserver> observer,
    const GrpcMetadata& metadata,
    AssetStreamRpcType rpc_type): observer_(observer),
                                  stor_(std::move(stor)) {
  ASSERT_EQ(0, lock_.init(true));
  GrpcClient::AddMetadata(&context_, metadata);

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
  const bool debug_enabled =
    per_process::enabled_debug_list.enabled(DebugCategory::NSOLID_GRPC_AGENT);
  if (debug_enabled) {
    uint64_t total_duration = 0;
    if (stream_stats_.stream_start > 0) {
      total_duration = uv_hrtime() - stream_stats_.stream_start;
    }

    Debug("[AssetStream] completion status=%s duration_ns=%" PRIu64
          " writes=%zu total_bytes=%zu error_code=%d error_message=%s "
          "error_details=%s\n",
          s.ok() ? "ok" : "error",
          total_duration,
          stream_stats_.write_count,
          stream_stats_.total_bytes,
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

  // Calculate and log latency for this write only when debug is enabled
  if (per_process::enabled_debug_list.enabled(
        DebugCategory::NSOLID_GRPC_AGENT) &&
      write_state_.write_start > 0) {
    uint64_t latency = uv_hrtime() - write_state_.write_start;
    Debug("[out] [%" PRIu64 "] %s command=%s requestId=%s data.length=%zu\n",
          latency,
          ok ? "ok" : "not ok",
          write_state_.asset.common().command().c_str(),
          write_state_.asset.common().requestid().c_str(),
          write_state_.asset.data().length());
    write_state_.write_start = 0;

    // Update stream statistics
    stream_stats_.write_count++;
    stream_stats_.total_bytes += write_state_.asset.data().length();
  }

  if (!ok) {
    write_state_.done = true;
    if (!write_state_.writes_done) {
      write_state_.writes_done = true;
      StartWritesDone();
      RemoveHold();
    }
  } else {
    NextWrite();
  }
}

void AssetStream::NextWrite() {
  if (!write_state_.done && write_state_.write_done) {
    if (assets_q_.dequeue(write_state_.asset)) {
      if (per_process::enabled_debug_list.enabled(
            DebugCategory::NSOLID_GRPC_AGENT)) {
        // Capture stream start time on first write
        if (stream_stats_.stream_start == 0) {
          stream_stats_.stream_start = uv_hrtime();
        }
        write_state_.write_start = uv_hrtime();
      }
      StartWrite(&write_state_.asset);
      write_state_.write_done = false;
    } else if (write_state_.write_done_called) {
      if (!write_state_.writes_done) {
        write_state_.writes_done = true;
        StartWritesDone();
        RemoveHold();
      }
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
