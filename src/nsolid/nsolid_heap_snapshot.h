#ifndef SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_
#define SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_

#include <map>
#include "nsolid.h"
#include "nsolid/nsolid_util.h"
#include "nsuv-inl.h"

namespace node {
namespace nsolid {

class NSolidHeapSnapshot {
 public:
  struct HeapSnapshotStor {
    bool redacted;
    Snapshot::snapshot_proxy_sig cb;
    internal::user_data data;
  };

  NSOLID_DELETE_UNUSED_CONSTRUCTORS(NSolidHeapSnapshot)

  static NSolidHeapSnapshot* Inst();
  ~NSolidHeapSnapshot() = default;

  int GetHeapSnapshot(SharedEnvInst envinst,
                      bool redacted,
                      void* data,
                      Snapshot::snapshot_proxy_sig proxy,
                      internal::deleter_sig deleter);

 private:
  NSolidHeapSnapshot();

  static void take_snapshot(SharedEnvInst envinst_sp, NSolidHeapSnapshot*);

  static void snapshot_cb(uint64_t thread_id,
                          int status,
                          const std::string& snapshot);

  std::map<uint64_t, HeapSnapshotStor> threads_running_snapshots_;
  nsuv::ns_mutex in_progress_heap_snapshots_;
};

}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_
