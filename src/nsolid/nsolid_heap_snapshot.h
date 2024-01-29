#ifndef SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_
#define SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_

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
    bool is_tracking_heapobjects_;
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

  int StartTrackingHeapObjects(SharedEnvInst envinst,
                               bool redacted,
                               bool trackAllocations,
                               uint64_t duration,
                               internal::user_data data,
                               Snapshot::snapshot_proxy_sig proxy);

  int StopTrackingHeapObjects(SharedEnvInst envinst);

 private:
  NSolidHeapSnapshot();

  static void start_tracking_heapobjects(SharedEnvInst envinst,
                                         bool trackAllocations,
                                         uint64_t duration,
                                         NSolidHeapSnapshot*);

  static void stop_tracking_heap_objects(SharedEnvInst envinst_sp,
                                         NSolidHeapSnapshot*);

  static void take_snapshot(SharedEnvInst envinst_sp, NSolidHeapSnapshot*);

  static void take_snapshot_timer(SharedEnvInst envinst_sp,
                                  NSolidHeapSnapshot*);

  static void snapshot_cb(uint64_t thread_id,
                          int status,
                          const std::string& snapshot);

  std::map<uint64_t, HeapSnapshotStor> threads_running_snapshots_;
  nsuv::ns_mutex in_progress_heap_snapshots_;
};

}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_
