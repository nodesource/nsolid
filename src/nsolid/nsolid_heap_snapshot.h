#ifndef SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_
#define SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include <v8.h>
#include <v8-profiler.h>
#include <nsolid/nsolid_api.h>
#include <nsolid/nsolid_output_stream.h>
#include <atomic>
#include <new>
#include <set>
#include <tuple>

#include "asserts-cpp/asserts.h"
#include "nlohmann/json.hpp"

namespace node {
namespace nsolid {

class NSolidHeapSnapshot {
 public:
  enum HeapSnapshotFlags {
    kFlagNone = 0,
    kFlagIsTrackingHeapObjects = 1 << 0,
    kFlagIsDone = 1 << 1
  };

  struct HeapSnapshotStor {
    bool redacted;
    uint32_t flags;
    uint64_t snapshot_id;
    Snapshot::snapshot_proxy_sig cb;
    internal::user_data data;
  };

  NSOLID_DELETE_UNUSED_CONSTRUCTORS(NSolidHeapSnapshot)

  static NSolidHeapSnapshot* Inst();

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

  int StopTrackingHeapObjectsSync(SharedEnvInst envinst);

 private:
  NSolidHeapSnapshot();
  ~NSolidHeapSnapshot();

  static void start_tracking_heapobjects(SharedEnvInst envinst,
                                         bool trackAllocations,
                                         uint64_t duration,
                                         uint64_t profile_id,
                                         NSolidHeapSnapshot*);

  static void stop_tracking_heap_objects(SharedEnvInst envinst_sp,
                                         NSolidHeapSnapshot*);

  static void take_snapshot(SharedEnvInst envinst_sp, NSolidHeapSnapshot*);

  static void take_snapshot_timer(SharedEnvInst envinst_sp,
                                  uint64_t profile_id,
                                  NSolidHeapSnapshot*);

  static void snapshot_cb(uint64_t thread_id,
                          int status,
                          const std::string& snapshot);

  std::map<uint64_t, HeapSnapshotStor> threads_running_snapshots_;
  nsuv::ns_mutex in_progress_heap_snapshots_;
  std::atomic<uint64_t> in_progress_timers_{0};
};

}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_
