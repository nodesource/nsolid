#include "profile_collector.h"
#include "asserts-cpp/asserts.h"

namespace node {
namespace nsolid {

ProfileCollector::~ProfileCollector() {
  profile_msg_->close_and_delete();
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
  if (collector->profile_msg_q_.enqueue(std::move(qstor)) == 1) {
    ASSERT_EQ(0, collector->profile_msg_->send());
  }
}

void ProfileCollector::initialize() {
  int er = profile_msg_->init(
    loop_,
    +[](nsuv::ns_async*, WeakProfileCollector collector_wp) {
      SharedProfileCollector collector = collector_wp.lock();
      if (collector == nullptr) {
        return;
      }

      collector->process_profiles();
    },
    weak_from_this());
  ASSERT_EQ(0, er);
}

void ProfileCollector::process_profiles() {
  ProfileQStor qstor;
  while (profile_msg_q_.dequeue(qstor)) {
    callback_(std::move(qstor));
  }
}

}  // namespace nsolid
}  // namespace node
