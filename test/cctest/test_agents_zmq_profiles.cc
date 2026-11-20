#include "zmq/src/zmq_agent.h"

// Use gtest assertions after parsing the internal agent headers.
#undef ASSERT_EQ
#undef ASSERT_GE
#undef ASSERT_GT
#undef ASSERT_LE
#undef ASSERT_LT
#undef ASSERT_NE
#include "node_test_fixture.h"

namespace node {
namespace nsolid {

class ZmqAgentTest : public NodeZeroIsolateTestFixture {
 protected:
  void CheckPendingProfiles() {
    ZmqAgent instance;
    ZmqAgent* agent = &instance;
    // No agent thread runs: native collection has finished, but its final
    // queued chunk has not yet been consumed by the agent.
    agent->data_handle_.reset(new ZmqDataHandle(*agent));
    ASSERT_EQ(0, agent->data_handle_->config({{"data", "tcp://127.0.0.1:1"}}));
    agent->status_ = ZmqAgent::Buffering;
    ASSERT_EQ(0,
              agent->start_profiling_msg_.init(
                  agent->loop(), +[](nsuv::ns_async*) {}));
    agent->profile_collector_ = std::make_shared<ProfileCollector>(
        agent->loop(), +[](ProfileCollector::ProfileQStor&&) {});
    auto cleanup = OnScopeLeave([&] {
      agent->profile_collector_.reset();
      agent->start_profiling_msg_.close();
      agent->data_handle_.reset();
      uv_run(agent->loop(), UV_RUN_DEFAULT);
    });

    constexpr uint64_t thread_id = UINT64_MAX;
    const nlohmann::json message = {{"args",
                                     {{"threadId", thread_id},
                                      {"duration", uint64_t{100}},
                                      {"trackAllocations", false}}}};
    using Start = int (ZmqAgent::*)(const nlohmann::json&);
    const Start starts[] = {&ZmqAgent::start_profiling_from_js,
                            &ZmqAgent::start_heap_profiling_from_js,
                            &ZmqAgent::start_heap_sampling_from_js,
                            &ZmqAgent::start_heap_snapshot_from_js};
    using RemoteStart =
        int (ZmqAgent::*)(const nlohmann::json&, const std::string&);
    const RemoteStart remote_starts[] = {&ZmqAgent::start_profiling,
                                         &ZmqAgent::start_heap_profiling,
                                         &ZmqAgent::start_heap_sampling,
                                         &ZmqAgent::start_heap_snapshot};
    ProfileOptions options[] = {CPUProfileOptions(),
                                HeapProfileOptions(),
                                HeapSamplingOptions(),
                                HeapSnapshotOptions()};
    for (int i = 0; i < kNumberOfProfileTypes; ++i) {
      const auto type = static_cast<ProfileType>(i);
      auto& state = agent->profile_state_[type];
      std::visit([&](auto& opt) { opt.thread_id = thread_id; }, options[i]);
      state.pending_profiles_map.emplace(
          thread_id,
          ZmqAgent::ProfileStor{"original", uv_hrtime() / 1000000, options[i]});
      if (type != kHeapSnapshot) state.nr_profiles++;

      EXPECT_EQ(UV_EEXIST, (agent->*starts[i])(message));
      while (!agent->data_ring_buffer_.empty()) agent->data_ring_buffer_.pop();
      EXPECT_EQ(UV_EEXIST, (agent->*remote_starts[i])(message, "duplicate"));
      ASSERT_FALSE(agent->data_ring_buffer_.empty());
      const auto response =
          nlohmann::json::parse(agent->data_ring_buffer_.front());
      EXPECT_EQ(409, response["error"]["code"]);
      EXPECT_EQ("duplicate", response["requestId"]);
      ASSERT_EQ(1u, state.pending_profiles_map.size());
      EXPECT_EQ("original", state.pending_profiles_map.at(thread_id).req_id);
      agent->do_got_prof(type, thread_id, 0, "chunk");
      EXPECT_EQ("original", state.pending_profiles_map.at(thread_id).req_id);
      EXPECT_EQ(UV_EEXIST, (agent->*starts[i])(message));

      // A different thread or type must reach native validation instead.
      auto other_thread = message;
      other_thread["args"]["threadId"] = thread_id - 1;
      EXPECT_EQ(UV_ESRCH, (agent->*starts[i])(other_thread));
      EXPECT_EQ(UV_ESRCH, (agent->*starts[(i + 1) % 4])(message));

      agent->do_got_prof(type, thread_id, UV_ECANCELED, "");
      EXPECT_TRUE(state.pending_profiles_map.empty());
      EXPECT_EQ(0u, state.nr_profiles.load());
      // No native thread exists. Failed startup must leave no reservation.
      EXPECT_EQ(UV_ESRCH, (agent->*starts[i])(message));
      EXPECT_TRUE(state.pending_profiles_map.empty());
    }
  }
};

TEST_F(ZmqAgentTest, PendingProfiles) {
  CheckPendingProfiles();
}

}  // namespace nsolid
}  // namespace node
