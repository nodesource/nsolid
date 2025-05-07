#ifndef AGENTS_SRC_PROFILE_COLLECTOR_H_
#define AGENTS_SRC_PROFILE_COLLECTOR_H_

#include <nsolid.h>
#include <nsolid/async_ts_queue.h>
#include <nsolid/thread_safe.h>
#include "google/protobuf/struct.pb.h"
#include "nlohmann/json.hpp"
#include "nsuv-inl.h"
#include <variant>
#include <vector>

namespace node {
namespace nsolid {

class ProfileCollector;

using SharedProfileCollector = std::shared_ptr<ProfileCollector>;
using WeakProfileCollector = std::weak_ptr<ProfileCollector>;

enum ProfileType {
  kCpu = 0,
  kHeapProf,
  kHeapSampl,
  kHeapSnapshot,
  kNumberOfProfileTypes
};

extern const char* ProfileTypeStr[kNumberOfProfileTypes];
extern const char* ProfileTypeStopStr[kNumberOfProfileTypes];

struct ProfileOptionsBase {
  uint64_t thread_id;
  uint64_t duration;
  nlohmann::json metadata;
  google::protobuf::Struct metadata_pb;
};

using CPUProfileOptions = ProfileOptionsBase;

struct HeapProfileOptions: public ProfileOptionsBase {
  bool track_allocations = false;
  bool redacted = false;
};

struct HeapSamplingOptions: public ProfileOptionsBase {
  uint64_t sample_interval = 0;
  int stack_depth = 0;
  v8::HeapProfiler::SamplingFlags flags = v8::HeapProfiler::kSamplingNoFlags;
};

struct HeapSnapshotOptions: public ProfileOptionsBase {
  bool redacted = false;
};

using ProfileOptions = std::variant<CPUProfileOptions,
                                    HeapProfileOptions,
                                    HeapSamplingOptions,
                                    HeapSnapshotOptions>;


/*
 * ProfileCollector is a class that allows to start collecting profiles and
 * report them to a callback function running in a specific uv_loop_t thread.
 */
class ProfileCollector: public std::enable_shared_from_this<ProfileCollector> {
 public:
  struct ProfileQStor {
    int status;
    std::string profile;
    ProfileType type;
    ProfileOptions options;
  };

  template <typename Cb, typename... Data>
  explicit ProfileCollector(uv_loop_t* loop, Cb&& cb, Data&&... data) {
    // Create the AsyncTSQueue for profile messages
    profile_queue_ = AsyncTSQueue<ProfileQStor>::create(
        loop,
        std::forward<Cb>(cb),
        std::forward<Data>(data)...);
  }
  ~ProfileCollector();

  int StartCPUProfile(const CPUProfileOptions& options);
  int StartHeapProfile(const HeapProfileOptions& options);
  int StartHeapSampling(const HeapSamplingOptions& options);
  int StartHeapSnapshot(const HeapSnapshotOptions& options);

 private:
  static void profile_cb(int status,
                         std::string profile,
                         ProfileType type,
                         ProfileOptions options,
                         WeakProfileCollector collector_wp);

  std::shared_ptr<AsyncTSQueue<ProfileQStor>> profile_queue_;
};

}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_SRC_PROFILE_COLLECTOR_H_
