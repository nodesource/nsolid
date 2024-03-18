#ifndef SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_
#define SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include <atomic>
#include <map>
#include <string>

#include "nlohmann/json.hpp"
#include "nsolid.h"
#include "nsolid_util.h"
#include "nsuv-inl.h"

namespace node {
namespace nsolid {

class NSolidHeapSnapshot {
 public:
  enum HeapSnapshotFlags {
    kFlagNone = 0,
    kFlagIsTrackingHeapObjects = 1 << 0,
    kFlagIsSamplingHeap = 1 << 1,
    kFlagIsDone = 1 << 2
  };

  struct HeapSnapshotStor {
    bool redacted;
    uint32_t flags;
    uint64_t snapshot_id;
    Snapshot::snapshot_proxy_sig cb;
    internal::user_data data;
  };

  struct HeapSamplerStor {
    uint64_t sample_interval;
    int stack_depth;
    v8::HeapProfiler::SamplingFlags sampling_flags;
    uint64_t duration;
    uint32_t flags;
    uint64_t snapshot_id;
    Snapshot::snapshot_proxy_sig cb;
    internal::user_data data;
  };

  NSOLID_DELETE_UNUSED_CONSTRUCTORS(NSolidHeapSnapshot)

  NSolidHeapSnapshot();
  ~NSolidHeapSnapshot();


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
  int StartSamplingProfiler(SharedEnvInst envinst,
                            uint64_t sampleInterval,
                            int stackDepth,
                            // TODO(juan) - this is a bitfield ask to reviewers
                            // if it is ok to use the v8 enum for this one.
                            v8::HeapProfiler::SamplingFlags samplingFlags,
                            uint64_t duration,
                            internal::user_data data,
                            Snapshot::snapshot_proxy_sig proxy);

  int StopSamplingProfiler(SharedEnvInst envinst);
  int StopSamplingProfilerSync(SharedEnvInst envinst);

 private:
  static void start_tracking_heapobjects(SharedEnvInst envinst,
                                         bool trackAllocations,
                                         uint64_t duration,
                                         uint64_t profile_id,
                                         NSolidHeapSnapshot*);

  static void stop_tracking_heap_objects(SharedEnvInst envinst_sp,
                                         NSolidHeapSnapshot*);

  static void start_sampling_profiler(SharedEnvInst envinst,
                                      uint64_t duration,
                                      uint64_t snapshot_id,
                                      NSolidHeapSnapshot*);

  static void stop_sampling_profiler(SharedEnvInst envinst_sp,
                                     uint64_t snapshot_id,
                                     NSolidHeapSnapshot*);

  static void take_sampled_snapshot(SharedEnvInst envinst_sp,
                                    NSolidHeapSnapshot*);

  static void take_snapshot(SharedEnvInst envinst_sp, NSolidHeapSnapshot*);

  static void take_snapshot_timer(SharedEnvInst envinst_sp,
                                  uint64_t profile_id,
                                  NSolidHeapSnapshot*);

  static void snapshot_cb(uint64_t thread_id,
                          int status,
                          const std::string& snapshot,
                          NSolidHeapSnapshot* snapshotter);

  static void sampling_cb(uint64_t thread_id,
                          int status,
                          const std::string snapshot,
                          NSolidHeapSnapshot* snapshotter);

  std::map<uint64_t, HeapSnapshotStor> threads_running_snapshots_;
  nsuv::ns_mutex in_progress_heap_snapshots_;
  std::atomic<uint64_t> in_progress_timers_{0};

  std::map<uint64_t, HeapSamplerStor> threads_running_heap_sampling_;
  nsuv::ns_mutex in_progress_heap_sampling_;
};

}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_NSOLID_HEAP_SNAPSHOT_H_
