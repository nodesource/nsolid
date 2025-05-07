#ifndef AGENTS_GRPC_SRC_ASSET_STREAM_H_
#define AGENTS_GRPC_SRC_ASSET_STREAM_H_

#include "./proto/nsolid_service.grpc.pb.h"
#include "grpcpp/grpcpp.h"
#include "nsolid/thread_safe.h"
#include "../../src/profile_collector.h"
#include "nsuv-inl.h"


namespace node {
namespace nsolid {
namespace grpc {

// Predeclarations
class AssetStream;

struct AssetStor {
  ProfileType type;
  uint64_t thread_id;
  AssetStream* stream = nullptr;
};

class AssetStreamObserver {
 public:
  virtual ~AssetStreamObserver() = default;

  virtual void on_asset_stream_done(const ::grpc::Status&, AssetStor&&) = 0;
};

class AssetStream: public ::grpc::ClientWriteReactor<grpcagent::Asset> {
  struct WriteState {
    bool done = false;
    bool write_done = true;
    bool write_done_called = false;
    grpcagent::Asset asset;
  };

 public:
  explicit AssetStream(grpcagent::NSolidService::StubInterface* stub,
                       AssetStor&& stor,
                       std::weak_ptr<AssetStreamObserver> observer,
                       const std::string& agent_id,
                       const std::string& saas);

  ~AssetStream();

  void OnDone(const ::grpc::Status& /*s*/) override;

  void OnWriteDone(bool /*ok*/) override;

  void Write(grpcagent::Asset&& resp);

  void WritesDone(bool error = false);

 private:
  void NextWrite();

 private:
  std::weak_ptr<AssetStreamObserver> observer_;
  AssetStor stor_;
  ::grpc::ClientContext context_;
  grpcagent::EventResponse event_response_;
  WriteState write_state_;
  TSQueue<grpcagent::Asset> assets_q_;
  nsuv::ns_mutex lock_;
};

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_ASSET_STREAM_H_
