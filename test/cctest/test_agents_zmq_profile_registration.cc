#include "gtest/gtest.h"
#include "zmq/src/zmq_agent.h"

namespace node {
namespace nsolid {

class ZmqProfileRegistrationTestPeer {
 public:
  static void BackToBackSnapshots() {
    ZmqAgent agent;
    HeapSnapshotOptions options{};
    options.thread_id = 0;
    auto& profiles = agent.profile_state_[kHeapSnapshot].pending_profiles_map;
    profiles.emplace(0, ZmqAgent::ProfileStor{"first", 0, options});
    agent.start_profiling_msg_q_.enqueue({0, "second", kHeapSnapshot, options});
    agent.start_profiling_msg_q_.enqueue({0, "third", kHeapSnapshot, options});

    // Results for the first snapshot must not consume later registrations.
    agent.got_profile({0, "chunk", kHeapSnapshot, options});
    EXPECT_EQ(agent.start_profiling_msg_q_.size(), 2);
    EXPECT_EQ(profiles.at(0).req_id, "first");

    // Even an ordinary start callback must retain both starts, in order.
    ZmqAgent::start_profiling_msg_cb(nullptr, &agent);
    ASSERT_EQ(agent.pending_profile_starts_.size(), 2);
    EXPECT_EQ(agent.pending_profile_starts_.front().req_id, "second");
    EXPECT_EQ(agent.pending_profile_starts_.back().req_id, "third");
    agent.got_profile({0, "chunk", kHeapSnapshot, options});
    EXPECT_EQ(profiles.at(0).req_id, "first");
    EXPECT_EQ(agent.pending_profile_starts_.size(), 2);
  }
};

TEST(ZmqProfileRegistrationTest, BackToBackSnapshots) {
  ZmqProfileRegistrationTestPeer::BackToBackSnapshots();
}

}  // namespace nsolid
}  // namespace node
