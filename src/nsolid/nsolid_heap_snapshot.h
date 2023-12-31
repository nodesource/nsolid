#ifndef SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_
#define SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include <v8.h>
#include <v8-profiler.h>
#include <nsolid/nsolid_api.h>
#include <nsolid/nsolid_output_stream.h>
#include <new>
#include <set>
#include <tuple>

#include "asserts-cpp/asserts.h"
#include "nlohmann/json.hpp"

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

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_
