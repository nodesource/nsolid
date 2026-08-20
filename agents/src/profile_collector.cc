#include "profile_collector.h"
#include "asserts-cpp/asserts.h"

namespace node {
namespace nsolid {

const char* ProfileTypeStr[kNumberOfProfileTypes] = {
  "profile",
  "heap_profile",
  "heap_sampling",
  "snapshot"
};

const char* ProfileTypeStopStr[kNumberOfProfileTypes] = {
  "profile_stop",
  "heap_profile_stop",
  "heap_sampling_stop",
  ""
};

ProfileCollector::~ProfileCollector() {
}

int ProfileCollector::StartCPUProfile(const CPUProfileOptions& options) {
  return CpuProfiler::TakeProfile(GetEnvInst(options.thread_id),
                                  options.duration,
                                  profile_cb,
                                  kCpu,
                                  options,
                                  weak_from_this());
}

int ProfileCollector::StartHeapProfile(const HeapProfileOptions& options) {
  return Snapshot::StartTrackingHeapObjects(GetEnvInst(options.thread_id),
                                            options.redacted,
                                            options.track_allocations,
                                            options.duration,
                                            profile_cb,
                                            kHeapProf,
                                            options,
                                            weak_from_this());
}

int ProfileCollector::StartHeapSampling(const HeapSamplingOptions& options) {
  return Snapshot::StartSampling(GetEnvInst(options.thread_id),
                                 options.sample_interval,
                                 options.stack_depth,
                                 options.flags,
                                 options.duration,
                                 profile_cb,
                                 kHeapSampl,
                                 options,
                                 weak_from_this());
}

int ProfileCollector::StartHeapSnapshot(const HeapSnapshotOptions& options) {
  return Snapshot::TakeSnapshot(GetEnvInst(options.thread_id),
                                options.redacted,
                                profile_cb,
                                kHeapSnapshot,
                                options,
                                weak_from_this());
}

/*static*/
void ProfileCollector::profile_cb(int status,
                                 std::string profile,
                                 ProfileType type,
                                 ProfileOptions options,
                                 WeakProfileCollector collector_wp) {
  SharedProfileCollector collector = collector_wp.lock();
  if (collector == nullptr) {
    return;
  }

  ProfileQStor qstor = {status, profile, type, std::move(options)};
  collector->profile_queue_->enqueue(std::move(qstor));
}

}  // namespace nsolid
}  // namespace node
