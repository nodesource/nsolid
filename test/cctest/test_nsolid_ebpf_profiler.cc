#include "nsolid/nsolid_ebpf_profiler.h"

#include <cstdio>
#include <fcntl.h>
#include <algorithm>
#include <filesystem>
#include "node_test_fixture.h"
#include "gtest/gtest.h"

using node::nsolid::AddressRange;
using node::nsolid::Frame;
using node::nsolid::ClassifyFrame;
using node::nsolid::FrameKind;
using node::nsolid::Mappings;
using node::nsolid::PopulateNativeFrameInfo;
using node::nsolid::Stack;

TEST(EBPFProfilerTest, ClassifyFramePrefersJitRangeOverNativeMappings) {
  Mappings mappings;
  mappings.pathinfo.push_back({"/proc/self/exe", ""});
  mappings.mappings.push_back({0x1000, 0x3000, 0, 0});

  AddressRange code_range{0x1300, 0x1400};
  const node::nsolid::Mapping* mapping = nullptr;

  EXPECT_EQ(ClassifyFrame(0x13ff, code_range, mappings, mapping),
            FrameKind::kV8Jit);
  EXPECT_EQ(ClassifyFrame(0x2000, code_range, mappings, mapping),
            FrameKind::kNativeMapped);
  EXPECT_EQ(ClassifyFrame(0x5000, code_range, mappings, mapping),
            FrameKind::kUnknown);
}

TEST(EBPFProfilerTest, StackContainsCapturedFrames) {
  Stack stack(2);
  stack.frames[0].addr = 0x1000;
  stack.frames[1].addr = 0x2000;

  EXPECT_EQ(stack.frames.size(), 2u);
  EXPECT_EQ(stack.frames[0].addr, 0x1000u);
  EXPECT_EQ(stack.frames[1].addr, 0x2000u);
}

TEST(EBPFProfilerTest, PopulateNativeFrameInfoSupportsNonPieAddresses) {
  Mappings mappings;
  mappings.pathinfo.push_back({"/proc/self/exe", ""});
  mappings.mappings.push_back({0x400000, 0x401000, 0, 0, 0x400000, true});
  mappings.pathinfo[0].build_id = "deadbeef";

  Frame frame{.addr = 0x400234, .kind = FrameKind::kNativeMapped};

  ASSERT_TRUE(PopulateNativeFrameInfo(&frame, mappings,
                                     &mappings.mappings[0]));
  EXPECT_EQ(frame.relative_addr, 0x400234u);
  EXPECT_EQ(frame.build_id, "deadbeef");
}


TEST(EBPFProfilerTest, PopulateNativeFrameInfoSupportsPieAddresses) {
  Mappings mappings;
  mappings.pathinfo.push_back({"/proc/self/exe", ""});
  mappings.mappings.push_back({0x70000000, 0x70002000, 0, 0, 0, true});

  Frame frame{.addr = 0x70001234, .kind = FrameKind::kNativeMapped};

  ASSERT_TRUE(PopulateNativeFrameInfo(&frame, mappings,
                                     &mappings.mappings[0]));
  EXPECT_EQ(frame.relative_addr, 0x1234u);
}

TEST(EBPFProfilerTest, PopulateNativeFrameInfoSkipsMissingElfAddress) {
  Mappings mappings;
  mappings.pathinfo.push_back({"/proc/self/exe", ""});
  mappings.mappings.push_back({0x1000, 0x2000, 0, 0, 0, false});

  Frame frame{.addr = 0x1234, .kind = FrameKind::kNativeMapped};

  EXPECT_FALSE(PopulateNativeFrameInfo(&frame, mappings,
                                     &mappings.mappings[0]));
}
TEST_F(NodeZeroIsolateTestFixture, EBPFProfilerThreadLifecycle) {
  auto* envlist = node::nsolid::EnvList::Inst();
  auto profiler = envlist->GetEBPFProfiler();
  ASSERT_NE(profiler, nullptr);
  ASSERT_FALSE(node::nsolid::utils::are_threads_equal(
      uv_thread_self(), envlist->thread()));

  // Disable waits for startup initialization and leaves sampling inactive.
  ASSERT_TRUE(envlist->ConfigureEBPFProfiling(false));
  EXPECT_TRUE(profiler->GetMappings().mappings.empty());
  for (int i = 0; i < 3; ++i) {
    const bool enabled = envlist->ConfigureEBPFProfiling(true);
    EXPECT_EQ(envlist->GetEBPFProfiler(), profiler);
    if (enabled)
      EXPECT_FALSE(profiler->GetMappings().mappings.empty());
    EXPECT_TRUE(envlist->ConfigureEBPFProfiling(false));
    EXPECT_EQ(envlist->GetEBPFProfiler(), profiler);
    EXPECT_TRUE(profiler->GetMappings().mappings.empty());
  }

  uv_sem_t done;
  ASSERT_EQ(uv_sem_init(&done, 0), 0);
  ASSERT_EQ(envlist->QueueCallback([](void* data) {
    auto* envlist = node::nsolid::EnvList::Inst();
    auto profiler = envlist->GetEBPFProfiler();
    // Calling from the owning thread must not wait on its own callback queue.
    envlist->ConfigureEBPFProfiling(true);
    EXPECT_EQ(envlist->GetEBPFProfiler(), profiler);
    EXPECT_TRUE(envlist->ConfigureEBPFProfiling(false));
    EXPECT_TRUE(profiler->GetMappings().mappings.empty());
    // The timer survives disable; its initialization belongs to this thread.
    struct TimerState {
      void* profiler;
      size_t count = 0;
    } state{profiler.get()};
    uv_walk(envlist->thread_loop(), [](uv_handle_t* handle, void* data) {
      auto* state = static_cast<TimerState*>(data);
      if (handle->type == UV_TIMER && handle->data == state->profiler) {
        ++state->count;
        EXPECT_FALSE(uv_is_active(handle));
        EXPECT_FALSE(uv_has_ref(handle));
      }
    }, &state);
    EXPECT_EQ(state.count, 1U);
    uv_sem_post(static_cast<uv_sem_t*>(data));
  }, &done), 0);
  uv_sem_wait(&done);
  uv_sem_destroy(&done);
}

TEST_F(NodeZeroIsolateTestFixture, EBPFProfilerDuplicateThreadAttachment) {
  auto* envlist = node::nsolid::EnvList::Inst();
  ASSERT_TRUE(envlist->ConfigureEBPFProfiling(false));
  const size_t baseline = PerfEventFds().size();
  if (!envlist->ConfigureEBPFProfiling(true))
    GTEST_SKIP() << "eBPF profiling is unsupported or unavailable";

  auto profiler = envlist->GetEBPFProfiler();
  EXPECT_EQ(PerfEventFds().size(), baseline + 1);
  // Enable already attached the main OS thread. Reattachment must be a no-op.
  EXPECT_TRUE(profiler->AddThread(uv_os_getpid()));
  EXPECT_TRUE(profiler->AddThread(uv_os_getpid()));
  EXPECT_EQ(PerfEventFds().size(), baseline + 1);
  EXPECT_TRUE(envlist->ConfigureEBPFProfiling(false));
  EXPECT_EQ(PerfEventFds().size(), baseline);
}

TEST_F(NodeZeroIsolateTestFixture, EBPFProfilerDescriptorsCloseOnExec) {
  auto* envlist = node::nsolid::EnvList::Inst();
  ASSERT_TRUE(envlist->ConfigureEBPFProfiling(false));
  const auto baseline = PerfEventFds();
  if (!envlist->ConfigureEBPFProfiling(true))
    GTEST_SKIP() << "eBPF profiling is unsupported or unavailable";

  const auto fds = PerfEventFds();
  EXPECT_EQ(fds.size(), baseline.size() + 1);
  for (int fd : fds) {
    if (std::find(baseline.begin(), baseline.end(), fd) != baseline.end())
      continue;
    const int flags = fcntl(fd, F_GETFD);
    EXPECT_NE(flags, -1);
    EXPECT_EQ(flags & FD_CLOEXEC, FD_CLOEXEC);
  }
  EXPECT_TRUE(envlist->ConfigureEBPFProfiling(false));
  EXPECT_EQ(PerfEventFds().size(), baseline.size());
}


TEST(EBPFProfilerTest, NativeMappingIsReusedAndClearedForOtherKinds) {
  Mappings mappings;
  mappings.pathinfo.push_back({"/proc/self/exe", "deadbeef"});
  mappings.mappings.push_back({0x1000, 0x2000, 0, 0, 0x400000, true});
  const AddressRange code_range{0x1300, 0x1400};
  const node::nsolid::Mapping* mapping = nullptr;
  Frame frame{.addr = 0x1234};
  frame.kind = ClassifyFrame(frame.addr, code_range, mappings, mapping);
  ASSERT_EQ(mapping, &mappings.mappings[0]);
  EXPECT_FALSE(PopulateNativeFrameInfo(&frame, mappings, nullptr));
  ASSERT_TRUE(PopulateNativeFrameInfo(&frame, mappings, mapping));
  EXPECT_EQ(frame.relative_addr, 0x400234U);
  EXPECT_EQ(frame.build_id, "deadbeef");

  frame.addr = 0x13ff;
  frame.kind = ClassifyFrame(frame.addr, code_range, mappings, mapping);
  EXPECT_EQ(frame.kind, FrameKind::kV8Jit);
  EXPECT_EQ(mapping, nullptr);
  EXPECT_FALSE(PopulateNativeFrameInfo(&frame, mappings, mapping));

  mapping = &mappings.mappings[0];
  frame.addr = 0x2000;
  frame.kind = ClassifyFrame(frame.addr, code_range, mappings, mapping);
  EXPECT_EQ(frame.kind, FrameKind::kUnknown);
  EXPECT_EQ(mapping, nullptr);
  EXPECT_FALSE(PopulateNativeFrameInfo(&frame, mappings, mapping));

  mappings.mappings[0].has_elf_vaddr = false;
  frame.addr = 0x1234;
  frame.kind = ClassifyFrame(frame.addr, code_range, mappings, mapping);
  ASSERT_EQ(mapping, &mappings.mappings[0]);
  EXPECT_FALSE(PopulateNativeFrameInfo(&frame, mappings, mapping));
}

TEST(EBPFProfilerTest, DISABLED_NativeFrameMappingBenchmark) {
  constexpr size_t iterations = 10000;
  std::printf("mode,scenario,mappings,iterations,ns_per_frame\n");
  for (size_t count : {100U, 1000U, 10000U}) {
    Mappings mappings;
    mappings.pathinfo.push_back({"/proc/self/exe", "deadbeef"});
    for (size_t i = 0; i < count; ++i) {
      const uintptr_t start = 0x1000 + i * 0x100;
      mappings.mappings.push_back({start, start + 0x80, 0, 0, 0, true});
    }
    const AddressRange code_range{0x1000, 0x1080};
    for (const char* scenario : {"first", "last", "unknown", "jit"}) {
      SCOPED_TRACE(scenario);
      const bool jit = std::string(scenario) == "jit";
      const bool unknown = std::string(scenario) == "unknown";
      const uintptr_t addr = unknown ? 0x1000 + count * 0x100 :
          std::string(scenario) == "last" ?
          0x1008 + (count - 1) * 0x100 : 0x1008;
      for (bool reuse : {false, true}) {
        SCOPED_TRACE(reuse);
        Frame frame{.addr = addr};
        size_t populated = 0;
        const AddressRange range = jit ? code_range : AddressRange{};
        const uint64_t start = uv_hrtime();
        for (size_t i = 0; i < iterations; ++i) {
          const node::nsolid::Mapping* mapping = nullptr;
          frame.kind = ClassifyFrame(addr, range, mappings, mapping);
          // Reference the previous double lookup only in the benchmark.
          if (!reuse && frame.kind == FrameKind::kNativeMapped)
            mapping = mappings.get_mapping(addr);
          populated += PopulateNativeFrameInfo(&frame, mappings, mapping);
        }
        const uint64_t elapsed = uv_hrtime() - start;
        ASSERT_EQ(populated, jit || unknown ? 0U : iterations);
        ASSERT_EQ(frame.kind, jit ? FrameKind::kV8Jit :
                  unknown ? FrameKind::kUnknown : FrameKind::kNativeMapped);
        if (!jit && !unknown) {
          ASSERT_EQ(frame.relative_addr, 8U);
          ASSERT_EQ(frame.build_id, "deadbeef");
        }
        std::printf("%s,%s,%zu,%zu,%.2f\n", reuse ? "reuse" : "duplicate",
                    scenario, count, iterations,
                    static_cast<double>(elapsed) / iterations);
      }
    }
  }
}

