#include "nsolid/nsolid_api.h"
#include "nsolid/nsolid_ebpf_profiler.h"
#include "grpc/src/ebpf_profile_bucket.h"

#include <fcntl.h>
#include <algorithm>
#include <cstdio>
#include <filesystem>

#include "gtest/gtest.h"
#include "node_test_fixture.h"

using node::nsolid::AddressRange;
using node::nsolid::ClassifyFrame;
using node::nsolid::CodeEventInfo;
using node::nsolid::grpc::EBPFProfileBucketStartNs;
using node::nsolid::Frame;
using node::nsolid::FrameKind;
using node::nsolid::Mappings;
using node::nsolid::grpc::ParseEBPFProfileBucketSizeNs;
using node::nsolid::PopulateNativeFrameInfo;
using node::nsolid::Stack;
using node::nsolid::V8CodeSymbolTable;
using node::nsolid::grpc::kDefaultEBPFProfileBucketSizeNs;

namespace {

std::vector<int> PerfEventFds() {
  std::vector<int> fds;
  for (const auto& entry : std::filesystem::directory_iterator("/proc/self/fd")) {
    std::error_code error;
    const auto target = std::filesystem::read_symlink(entry.path(), error);
    EXPECT_TRUE(!error || error == std::errc::no_such_file_or_directory);
    if (!error && target.string().find("perf_event") != std::string::npos)
      fds.push_back(std::stoi(entry.path().filename().string()));
  }
  return fds;
}

CodeEventInfo MakeCodeEventInfo(uint64_t timestamp,
                                v8::CodeEventType type,
                                uintptr_t code_start,
                                uintptr_t prev_code_start,
                                size_t code_len,
                                const char* fn_name,
                                const char* script_name,
                                int script_line,
                                int script_column,
                                const char* comment) {
  return CodeEventInfo{
    0,
    timestamp,
    type,
    code_start,
    prev_code_start,
    code_len,
    fn_name,
    script_name,
    script_line,
    script_column,
    comment
  };
}

}  // namespace

// Opt-in benchmark: disabled so normal test runs do not measure performance.
TEST(EBPFProfilerTest, DISABLED_V8CodeSymbolTableLookupBenchmark) {
  constexpr size_t iterations = 10000;
  std::printf("scenario,entries,iterations,ns_per_lookup,hits,misses\n");
  for (size_t entries : {100U, 1000U, 10000U}) {
    for (const char* scenario : {"cached", "live", "history", "unknown"}) {
      SCOPED_TRACE(scenario);
      SCOPED_TRACE(entries);
      V8CodeSymbolTable table;
      const bool cached = std::string(scenario) == "cached";
      const bool history = std::string(scenario) == "history";
      const bool unknown = std::string(scenario) == "unknown";
      for (size_t i = 0; i < entries; ++i) {
        const uintptr_t start = 0x1000 + i * 0x100;
        table.Ingest(MakeCodeEventInfo(10,
                                      v8::CodeEventType::kFunctionType,
                                      start, 0, 0x80,
                                      "old_fn", "bench.js", 1, 1, ""));
        if (history) {
          table.Ingest(MakeCodeEventInfo(20,
                                        v8::CodeEventType::kFunctionType,
                                        start, 0, 0x80,
                                        "new_fn", "bench.js", 1, 1, ""));
        }
      }
      const uint64_t timestamp = history ? 15 : 20;
      Frame frame{.addr = 0x1008, .kind = FrameKind::kV8Jit};
      if (cached)
        ASSERT_TRUE(table.Resolve(frame.addr, timestamp, &frame));
      table.ConsumeResolutionCacheStats();

      size_t resolved = 0;
      const uint64_t start = uv_hrtime();
      for (size_t i = 0; i < iterations; ++i) {
        // Distinct PCs keep successful lookups cold without timing Ingest().
        // With the smallest table the largest offset is 107, below code_len.
        const uintptr_t pc = cached ? 0x1008 :
            0x1000 + (i % entries) * 0x100 +
            (unknown ? 0xc0 : 8 + i / entries);
        resolved += table.Resolve(pc, timestamp, &frame);
      }
      const uint64_t elapsed = uv_hrtime() - start;
      const auto stats = table.ConsumeResolutionCacheStats();
      ASSERT_EQ(resolved, unknown ? 0U : iterations);
      ASSERT_EQ(stats.hits, cached ? iterations : 0U);
      ASSERT_EQ(stats.misses, cached ? 0U : iterations);
      if (!unknown) {
        ASSERT_EQ(frame.symbol_name, "old_fn");
        ASSERT_EQ(frame.script_name, "bench.js");
      }
      std::printf("%s,%zu,%zu,%.2f,%llu,%llu\n",
                  scenario, entries, iterations,
                  static_cast<double>(elapsed) / iterations,
                  static_cast<unsigned long long>(stats.hits),
                  static_cast<unsigned long long>(stats.misses));
    }
  }
}

TEST(EBPFProfilerTest, DISABLED_V8CodeSymbolTableMaintenanceBenchmark) {
  constexpr size_t iterations = 1000;
  std::printf("tables,entries_per_table,iterations,ns_per_sweep\n");
  for (size_t table_count : {1U, 8U}) {
    for (size_t entries : {100U, 1000U, 10000U}) {
      SCOPED_TRACE(table_count);
      SCOPED_TRACE(entries);
      std::vector<V8CodeSymbolTable> tables(table_count);
      for (auto& table : tables) {
        for (size_t i = 0; i < entries; ++i) {
          const uintptr_t start = 0x1000 + i * 0x100;
          table.Ingest(MakeCodeEventInfo(10,
                                        v8::CodeEventType::kFunctionType,
                                        start, 0, 0x80,
                                        "old_fn", "bench.js", 1, 1, ""));
          table.Ingest(MakeCodeEventInfo(20,
                                        v8::CodeEventType::kFunctionType,
                                        start, 0, 0x80,
                                        "new_fn", "bench.js", 1, 1, ""));
        }
        // Populate after ingestion, which invalidates the cache on each event.
        for (size_t i = 0; i < entries; ++i) {
          Frame frame{.addr = 0x1008 + i * 0x100, .kind = FrameKind::kV8Jit};
          ASSERT_TRUE(table.Resolve(frame.addr, 20, &frame));
        }
      }

      const uint64_t start = uv_hrtime();
      for (size_t i = 0; i < iterations; ++i) {
        for (auto& table : tables)
          table.EvictClosed(19);
      }
      const uint64_t elapsed = uv_hrtime() - start;
      // Nothing expires: measure the repeated full scans between evictions.
      for (const auto& table : tables) {
        ASSERT_EQ(table.LiveEntryCount(), entries);
        ASSERT_EQ(table.ClosedCodeSymbolCount(), entries);
        ASSERT_EQ(table.ResolutionCacheEntryCount(), entries);
      }
      std::printf("%zu,%zu,%zu,%.2f\n", table_count, entries, iterations,
                  static_cast<double>(elapsed) / iterations);
    }
  }
}

TEST(EBPFProfilerTest, DISABLED_V8CodeSymbolTableCleanupBenchmark) {
  constexpr size_t iterations = 20;
  std::printf("scenario,tables,entries_per_table,iterations,ns_per_sweep\n");
  for (size_t table_count : {1U, 8U}) {
    for (size_t entries : {100U, 1000U, 10000U}) {
      SCOPED_TRACE(table_count);
      SCOPED_TRACE(entries);
      std::vector<V8CodeSymbolTable> source(table_count);
      for (auto& table : source) {
        for (size_t i = 0; i < entries; ++i) {
          const uintptr_t start = 0x1000 + i * 0x100;
          table.Ingest(MakeCodeEventInfo(10,
                                        v8::CodeEventType::kFunctionType,
                                        start, 0, 0x80,
                                        "old_fn", "bench.js", 1, 1, ""));
          table.Ingest(MakeCodeEventInfo(i % 2 == 0 ? 20 : 30,
                                        v8::CodeEventType::kFunctionType,
                                        start, 0, 0x80,
                                        "new_fn", "bench.js", 1, 1, ""));
        }
        for (size_t i = 0; i < entries; ++i) {
          Frame frame{.addr = 0x1008 + i * 0x100, .kind = FrameKind::kV8Jit};
          ASSERT_TRUE(table.Resolve(frame.addr, 15, &frame));
        }
      }

      for (bool partial : {true, false}) {
        SCOPED_TRACE(partial);
        uint64_t elapsed = 0;
        for (size_t i = 0; i < iterations; ++i) {
          // Restore the same history and closed-version cache before each sweep.
          // Copying and destruction are excluded from the timed region.
          auto tables = source;
          const uint64_t start = uv_hrtime();
          for (auto& table : tables)
            table.EvictClosed(partial ? 21 : 31);
          elapsed += uv_hrtime() - start;
          const size_t retained = partial ? entries / 2 : 0;
          for (const auto& table : tables) {
            ASSERT_EQ(table.LiveEntryCount(), entries);
            ASSERT_EQ(table.ClosedCodeSymbolCount(), retained);
            ASSERT_EQ(table.ResolutionCacheEntryCount(), retained);
          }
        }
        std::printf("%s,%zu,%zu,%zu,%.2f\n",
                    partial ? "partial" : "full", table_count, entries,
                    iterations, static_cast<double>(elapsed) / iterations);
      }
    }
  }
}

TEST(EBPFProfilerTest, DISABLED_V8CodeSymbolTableAddressReuseBenchmark) {
  constexpr size_t iterations = 10000;
  std::printf("entries,iterations,ns_per_ingest,live_entries,closed_versions\n");
  for (size_t entries : {100U, 1000U, 10000U}) {
    SCOPED_TRACE(entries);
    V8CodeSymbolTable table;
    auto info = MakeCodeEventInfo(10,
                                 v8::CodeEventType::kFunctionType,
                                 0, 0, 0x80,
                                 "fn", "bench.js", 1, 1, "");
    for (size_t i = 0; i < entries; ++i) {
      info.code_start = 0x1000 + i * 0x100;
      table.Ingest(info);
    }
    const uint64_t start = uv_hrtime();
    for (size_t i = 0; i < iterations; ++i) {
      info.timestamp = 20 + i;
      // Alternate partially overlapping starts within otherwise disjoint slots.
      info.code_start = 0x1000 + (i % entries) * 0x100 +
                        ((i / entries) % 2 == 0 ? 0x40 : 0);
      table.Ingest(info);
    }
    const uint64_t elapsed = uv_hrtime() - start;
    const size_t live = table.LiveEntryCount();
    const size_t closed = table.ClosedCodeSymbolCount();
    // Valid on both revisions: report retention rather than assuming a policy.
    ASSERT_EQ(live + closed, entries + iterations);
    std::printf("%zu,%zu,%.2f,%zu,%zu\n", entries, iterations,
                static_cast<double>(elapsed) / iterations, live, closed);
  }
}

TEST(EBPFProfilerTest, DISABLED_V8CodeSymbolTableIngestionBenchmark) {
  constexpr size_t iterations = 10000;
  std::printf("entries,iterations,ns_per_ingest\n");
  for (size_t entries : {100U, 1000U, 10000U}) {
    SCOPED_TRACE(entries);
    V8CodeSymbolTable table;
    auto info = MakeCodeEventInfo(10,
                                 v8::CodeEventType::kFunctionType,
                                 0, 0, 0x80,
                                 "fn", "bench.js", 1, 1, "");
    for (size_t i = 0; i < entries; ++i) {
      info.code_start = 0x1000 + i * 0x100;
      table.Ingest(info);
    }
    const uint64_t start = uv_hrtime();
    for (size_t i = 0; i < iterations; ++i) {
      info.timestamp = 20 + i;
      info.code_start = 0x1000 + (entries + i) * 0x100;
      table.Ingest(info);
    }
    const uint64_t elapsed = uv_hrtime() - start;
    ASSERT_EQ(table.LiveEntryCount(), entries + iterations);
    ASSERT_EQ(table.ClosedCodeSymbolCount(), 0U);
    std::printf("%zu,%zu,%.2f\n", entries, iterations,
                static_cast<double>(elapsed) / iterations);
  }
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

TEST(EBPFProfileBucketTest, UsesDefaultBucketSize) {
  EXPECT_EQ(ParseEBPFProfileBucketSizeNs(""),
            kDefaultEBPFProfileBucketSizeNs);
}

TEST(EBPFProfileBucketTest, ParsesConfiguredBucketSize) {
  EXPECT_EQ(ParseEBPFProfileBucketSizeNs("2500"), 2500ULL * 1000000);
}

TEST(EBPFProfileBucketTest, InvalidBucketSizeUsesDefault) {
  EXPECT_EQ(ParseEBPFProfileBucketSizeNs("0"),
            kDefaultEBPFProfileBucketSizeNs);
  EXPECT_EQ(ParseEBPFProfileBucketSizeNs("not-a-number"),
            kDefaultEBPFProfileBucketSizeNs);
}

TEST(EBPFProfileBucketTest, ExactBoundaryBelongsToNextBucket) {
  constexpr uint64_t bucket_size = 10 * 1000000000ULL;
  EXPECT_EQ(EBPFProfileBucketStartNs(bucket_size - 1, bucket_size), 0);
  EXPECT_EQ(EBPFProfileBucketStartNs(bucket_size, bucket_size), bucket_size);
  EXPECT_EQ(EBPFProfileBucketStartNs(3 * bucket_size + 1, bucket_size),
            3 * bucket_size);
  EXPECT_EQ(EBPFProfileBucketStartNs(6 * 60 * 1000000000ULL, bucket_size),
            6 * 60 * 1000000000ULL);
}

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

TEST(EBPFProfilerTest, V8CodeSymbolTableResolvesLatestLiveEntry) {
  V8CodeSymbolTable table;
  Frame frame{.addr = 0x1018, .kind = FrameKind::kV8Jit};

  table.Ingest(MakeCodeEventInfo(10,
                                 v8::CodeEventType::kBuiltinType,
                                 0x1000,
                                 0,
                                 0x40,
                                 "",
                                 "bootstrap.js",
                                 7,
                                 11,
                                 "InterpreterEntryTrampoline"));

  ASSERT_TRUE(table.Resolve(frame.addr, 10, &frame));
  EXPECT_EQ(frame.symbol_name, "InterpreterEntryTrampoline");
  EXPECT_EQ(frame.symbol_offset, 0x18u);
  EXPECT_EQ(frame.symbol_event_type, v8::CodeEventType::kBuiltinType);
  EXPECT_EQ(frame.script_name, "bootstrap.js");
  EXPECT_EQ(frame.script_line, 7);
  EXPECT_EQ(frame.script_column, 11);
}

TEST(EBPFProfilerTest, V8CodeSymbolTablePrefersCorrectVersionByTimestamp) {
  V8CodeSymbolTable table;

  table.Ingest(MakeCodeEventInfo(10,
                                 v8::CodeEventType::kFunctionType,
                                 0x2000,
                                 0,
                                 0x20,
                                 "old_fn",
                                 "old.js",
                                 1,
                                 2,
                                 ""));
  table.Ingest(MakeCodeEventInfo(20,
                                 v8::CodeEventType::kFunctionType,
                                 0x2000,
                                 0,
                                 0x20,
                                 "new_fn",
                                 "new.js",
                                 3,
                                 4,
                                 ""));

  Frame old_frame{.addr = 0x2008, .kind = FrameKind::kV8Jit};
  Frame new_frame{.addr = 0x2008, .kind = FrameKind::kV8Jit};

  ASSERT_TRUE(table.Resolve(old_frame.addr, 19, &old_frame));
  EXPECT_EQ(old_frame.symbol_name, "old_fn");
  EXPECT_EQ(old_frame.script_name, "old.js");

  ASSERT_TRUE(table.Resolve(new_frame.addr, 20, &new_frame));
  EXPECT_EQ(new_frame.symbol_name, "new_fn");
  EXPECT_EQ(new_frame.script_name, "new.js");
}

TEST(EBPFProfilerTest, V8CodeSymbolTableInvalidatesLiveCacheOnNewEvent) {
  V8CodeSymbolTable table;

  table.Ingest(MakeCodeEventInfo(10,
                                 v8::CodeEventType::kFunctionType,
                                 0x2100,
                                 0,
                                 0x20,
                                 "old_fn",
                                 "old.js",
                                 1,
                                 2,
                                 ""));

  Frame cached_old_frame{.addr = 0x2108, .kind = FrameKind::kV8Jit};
  ASSERT_TRUE(table.Resolve(cached_old_frame.addr, 15, &cached_old_frame));
  EXPECT_EQ(cached_old_frame.symbol_name, "old_fn");

  table.Ingest(MakeCodeEventInfo(20,
                                 v8::CodeEventType::kFunctionType,
                                 0x2100,
                                 0,
                                 0x20,
                                 "new_fn",
                                 "new.js",
                                 3,
                                 4,
                                 ""));

  Frame new_frame{.addr = 0x2108, .kind = FrameKind::kV8Jit};
  ASSERT_TRUE(table.Resolve(new_frame.addr, 20, &new_frame));
  EXPECT_EQ(new_frame.symbol_name, "new_fn");
  EXPECT_EQ(new_frame.script_name, "new.js");
}

TEST(EBPFProfilerTest, V8CodeSymbolTableTracksRelocationHistory) {
  V8CodeSymbolTable table;

  table.Ingest(MakeCodeEventInfo(10,
                                 v8::CodeEventType::kFunctionType,
                                 0x3000,
                                 0,
                                 0x30,
                                 "moved_fn",
                                 "moved.js",
                                 7,
                                 11,
                                 ""));
  Frame before_move{.addr = 0x3010, .kind = FrameKind::kV8Jit};
  // Populate the cache before relocation closes the source entry.
  ASSERT_TRUE(table.Resolve(before_move.addr, 19, &before_move));

  table.Ingest(MakeCodeEventInfo(20,
                                 v8::CodeEventType::kRelocationType,
                                 0x4000,
                                 0x3000,
                                 0x30,
                                 "",
                                 "",
                                 0,
                                 0,
                                 ""));

  Frame after_move_old_addr{.addr = 0x3010, .kind = FrameKind::kV8Jit};
  Frame after_move_new_addr{.addr = 0x4010, .kind = FrameKind::kV8Jit};

  ASSERT_TRUE(table.Resolve(before_move.addr, 19, &before_move));
  EXPECT_EQ(before_move.symbol_name, "moved_fn");
  EXPECT_EQ(before_move.symbol_offset, 0x10u);

  EXPECT_FALSE(table.Resolve(after_move_old_addr.addr,
                             20,
                             &after_move_old_addr));
  EXPECT_FALSE(table.Resolve(after_move_new_addr.addr,
                             19,
                             &after_move_new_addr));

  ASSERT_TRUE(table.Resolve(after_move_new_addr.addr,
                            20,
                            &after_move_new_addr));
  EXPECT_EQ(after_move_new_addr.symbol_name, "moved_fn");
  EXPECT_EQ(after_move_new_addr.symbol_offset, 0x10u);
  EXPECT_EQ(after_move_new_addr.symbol_event_type,
            v8::CodeEventType::kFunctionType);
  EXPECT_EQ(after_move_new_addr.script_name, "moved.js");
  EXPECT_EQ(after_move_new_addr.script_line, 7);
  EXPECT_EQ(after_move_new_addr.script_column, 11);

  table.Ingest(MakeCodeEventInfo(30,
                                 v8::CodeEventType::kRelocationType,
                                 0x5000,
                                 0x4000,
                                 0x20,
                                 "",
                                 "",
                                 0,
                                 0,
                                 ""));
  ASSERT_TRUE(table.Resolve(after_move_new_addr.addr,
                            29,
                            &after_move_new_addr));
  EXPECT_EQ(after_move_new_addr.symbol_name, "moved_fn");
  EXPECT_FALSE(table.Resolve(after_move_new_addr.addr,
                             30,
                             &after_move_new_addr));

  Frame moved_again{.addr = 0x5010, .kind = FrameKind::kV8Jit};
  ASSERT_TRUE(table.Resolve(moved_again.addr, 30, &moved_again));
  EXPECT_EQ(moved_again.symbol_name, "moved_fn");
  EXPECT_EQ(moved_again.symbol_offset, 0x10u);
  EXPECT_EQ(moved_again.symbol_event_type, v8::CodeEventType::kFunctionType);
  EXPECT_EQ(moved_again.script_name, "moved.js");
  EXPECT_EQ(moved_again.script_line, 7);
  EXPECT_EQ(moved_again.script_column, 11);
  Frame past_end{.addr = 0x5020, .kind = FrameKind::kV8Jit};
  EXPECT_FALSE(table.Resolve(past_end.addr, 30, &past_end));
}

TEST(EBPFProfilerTest, V8CodeSymbolTableRelocationWithoutSourceMetadata) {
  V8CodeSymbolTable table;
  table.Ingest(MakeCodeEventInfo(20,
                                 v8::CodeEventType::kRelocationType,
                                 0x4000,
                                 0x3000,
                                 0x30,
                                 "",
                                 "",
                                 0,
                                 0,
                                 ""));
  Frame frame{.addr = 0x4010, .kind = FrameKind::kV8Jit};
  ASSERT_TRUE(table.Resolve(frame.addr, 20, &frame));
  EXPECT_EQ(frame.symbol_name, "RELOCATION");
  EXPECT_EQ(frame.symbol_event_type, v8::CodeEventType::kRelocationType);
  EXPECT_EQ(frame.symbol_offset, 0x10u);
  EXPECT_TRUE(frame.script_name.empty());
  EXPECT_EQ(frame.script_line, 0);
  EXPECT_EQ(frame.script_column, 0);
}

TEST(EBPFProfilerTest, V8CodeSymbolTableRetiresOverlappingRanges) {
  V8CodeSymbolTable table;
  table.Ingest(MakeCodeEventInfo(10,
                                v8::CodeEventType::kFunctionType,
                                0x1000, 0, 0x100,
                                "wide_fn", "wide.js", 1, 1, ""));
  Frame frame{.addr = 0x10ff, .kind = FrameKind::kV8Jit};
  ASSERT_TRUE(table.Resolve(frame.addr, 15, &frame));
  table.Ingest(MakeCodeEventInfo(20,
                                v8::CodeEventType::kFunctionType,
                                0x1040, 0, 0x10,
                                "narrow_fn", "narrow.js", 1, 1, ""));
  EXPECT_EQ(table.LiveEntryCount(), 1U);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 1U);
  ASSERT_TRUE(table.Resolve(frame.addr, 19, &frame));
  EXPECT_EQ(frame.symbol_name, "wide_fn");
  EXPECT_EQ(frame.symbol_offset, 0xffU);
  EXPECT_FALSE(table.Resolve(frame.addr, 20, &frame));
  ASSERT_TRUE(table.Resolve(0x1048, 20, &frame));
  EXPECT_EQ(frame.symbol_name, "narrow_fn");
  EXPECT_FALSE(table.Resolve(0x1050, 20, &frame));
  table.EvictClosed(20);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 1U);
  table.EvictClosed(21);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 0U);
  EXPECT_FALSE(table.Resolve(0x10ff, 19, &frame));
}

TEST(EBPFProfilerTest, V8CodeSymbolTableRetiresMultipleOverlaps) {
  V8CodeSymbolTable table;
  for (uintptr_t start : {0x1000U, 0x1020U, 0x1040U, 0x1050U}) {
    table.Ingest(MakeCodeEventInfo(10,
                                  v8::CodeEventType::kFunctionType,
                                  start, 0, 0x10,
                                  "old_fn", "old.js", 1, 1, ""));
  }
  table.Ingest(MakeCodeEventInfo(20,
                                v8::CodeEventType::kFunctionType,
                                0x1008, 0, 0x48,
                                "new_fn", "new.js", 1, 1, ""));
  EXPECT_EQ(table.LiveEntryCount(), 2U);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 3U);
  Frame frame{.addr = 0x1000, .kind = FrameKind::kV8Jit};
  ASSERT_TRUE(table.Resolve(frame.addr, 19, &frame));
  EXPECT_EQ(frame.symbol_name, "old_fn");
  EXPECT_FALSE(table.Resolve(frame.addr, 20, &frame));
  for (uintptr_t pc : {0x1008U, 0x1028U, 0x1048U}) {
    ASSERT_TRUE(table.Resolve(pc, 20, &frame));
    EXPECT_EQ(frame.symbol_name, "new_fn");
  }
  // Touching endpoints do not overlap, and age alone does not retire symbols.
  ASSERT_TRUE(table.Resolve(0x1058, 1000, &frame));
  EXPECT_EQ(frame.symbol_name, "old_fn");
}

TEST(EBPFProfilerTest, V8CodeSymbolTableRelocationRetiresDestinationOverlap) {
  V8CodeSymbolTable table;
  table.Ingest(MakeCodeEventInfo(10,
                                v8::CodeEventType::kFunctionType,
                                0x1000, 0, 0x40,
                                "moved_fn", "moved.js", 7, 11, ""));
  table.Ingest(MakeCodeEventInfo(10,
                                v8::CodeEventType::kFunctionType,
                                0x1ff0, 0, 0x30,
                                "old_fn", "old.js", 1, 1, ""));
  table.Ingest(MakeCodeEventInfo(20,
                                v8::CodeEventType::kRelocationType,
                                0x2000, 0x1000, 0x40,
                                "", "", 0, 0, ""));
  EXPECT_EQ(table.LiveEntryCount(), 1U);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 2U);
  Frame frame{.addr = 0x1ff8, .kind = FrameKind::kV8Jit};
  ASSERT_TRUE(table.Resolve(frame.addr, 19, &frame));
  EXPECT_EQ(frame.symbol_name, "old_fn");
  EXPECT_FALSE(table.Resolve(frame.addr, 20, &frame));
  ASSERT_TRUE(table.Resolve(0x2008, 20, &frame));
  EXPECT_EQ(frame.symbol_name, "moved_fn");
  EXPECT_EQ(frame.script_name, "moved.js");
  EXPECT_EQ(frame.symbol_event_type, v8::CodeEventType::kFunctionType);
}

TEST(EBPFProfilerTest, V8CodeSymbolTableIgnoresEmptyRanges) {
  V8CodeSymbolTable table;
  table.Ingest(MakeCodeEventInfo(10,
                                v8::CodeEventType::kFunctionType,
                                0x1000, 0, 0x100,
                                "wide_fn", "wide.js", 1, 1, ""));
  table.Ingest(MakeCodeEventInfo(20,
                                v8::CodeEventType::kFunctionType,
                                0x1040, 0, 0,
                                "empty_fn", "empty.js", 1, 1, ""));
  EXPECT_EQ(table.LiveEntryCount(), 1U);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 0U);
  table.Ingest(MakeCodeEventInfo(30,
                                v8::CodeEventType::kFunctionType,
                                0x1080, 0, 0x10,
                                "new_fn", "new.js", 1, 1, ""));
  EXPECT_EQ(table.LiveEntryCount(), 1U);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 1U);
  Frame frame{.addr = 0x1088, .kind = FrameKind::kV8Jit};
  ASSERT_TRUE(table.Resolve(frame.addr, 30, &frame));
  EXPECT_EQ(frame.symbol_name, "new_fn");
  // A zero-length replacement retires an exact-start entry without adding one.
  table.Ingest(MakeCodeEventInfo(40,
                                v8::CodeEventType::kFunctionType,
                                0x1080, 0, 0,
                                "empty_fn", "empty.js", 1, 1, ""));
  EXPECT_EQ(table.LiveEntryCount(), 0U);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 2U);
  EXPECT_FALSE(table.Resolve(frame.addr, 40, &frame));
  ASSERT_TRUE(table.Resolve(frame.addr, 39, &frame));
  EXPECT_EQ(frame.symbol_name, "new_fn");
}

TEST(EBPFProfilerTest, V8CodeSymbolTableLookupNearZero) {
  V8CodeSymbolTable table;
  Frame frame{.addr = 1, .kind = FrameKind::kV8Jit};
  EXPECT_FALSE(table.Resolve(frame.addr, 10, &frame));
  table.Ingest(MakeCodeEventInfo(10,
                                v8::CodeEventType::kFunctionType,
                                0, 0, 0x10,
                                "low_fn", "low.js", 1, 1, ""));
  ASSERT_TRUE(table.Resolve(frame.addr, 10, &frame));
  EXPECT_EQ(frame.symbol_name, "low_fn");
  EXPECT_EQ(frame.symbol_offset, 1U);
  EXPECT_FALSE(table.Resolve(0x10, 10, &frame));
}

TEST(EBPFProfilerTest, V8CodeSymbolTableEvictsClosedHistory) {
  V8CodeSymbolTable table;

  table.Ingest(MakeCodeEventInfo(10,
                                 v8::CodeEventType::kFunctionType,
                                 0x5000,
                                 0,
                                 0x20,
                                 "first_fn",
                                 "first.js",
                                 1,
                                 1,
                                 ""));
  table.Ingest(MakeCodeEventInfo(20,
                                 v8::CodeEventType::kFunctionType,
                                 0x5000,
                                 0,
                                 0x20,
                                 "second_fn",
                                 "second.js",
                                 2,
                                 2,
                                 ""));

  EXPECT_EQ(table.LiveEntryCount(), 1u);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 1u);

  Frame old_frame{.addr = 0x5008, .kind = FrameKind::kV8Jit};
  ASSERT_TRUE(table.Resolve(old_frame.addr, 19, &old_frame));
  EXPECT_EQ(old_frame.symbol_name, "first_fn");

  table.EvictClosed(21);

  EXPECT_EQ(table.LiveEntryCount(), 1u);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 0u);

  Frame evicted_old_frame{.addr = 0x5008, .kind = FrameKind::kV8Jit};
  EXPECT_FALSE(table.Resolve(evicted_old_frame.addr, 19, &evicted_old_frame));

  Frame live_frame{.addr = 0x5008, .kind = FrameKind::kV8Jit};
  ASSERT_TRUE(table.Resolve(live_frame.addr, 21, &live_frame));
  EXPECT_EQ(live_frame.symbol_name, "second_fn");
}

TEST(EBPFProfilerTest, V8CodeSymbolTableDoesNotEvictRecentClosedHistory) {
  V8CodeSymbolTable table;

  table.Ingest(MakeCodeEventInfo(10,
                                 v8::CodeEventType::kFunctionType,
                                 0x6000,
                                 0,
                                 0x20,
                                 "first_fn",
                                 "first.js",
                                 1,
                                 1,
                                 ""));
  table.Ingest(MakeCodeEventInfo(20,
                                 v8::CodeEventType::kFunctionType,
                                 0x6000,
                                 0,
                                 0x20,
                                 "second_fn",
                                 "second.js",
                                 2,
                                 2,
                                 ""));

  table.EvictClosed(20);

  EXPECT_EQ(table.LiveEntryCount(), 1u);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 1u);

  Frame old_frame{.addr = 0x6008, .kind = FrameKind::kV8Jit};
  ASSERT_TRUE(table.Resolve(old_frame.addr, 19, &old_frame));
  EXPECT_EQ(old_frame.symbol_name, "first_fn");
}

TEST(EBPFProfilerTest, V8CodeSymbolTableTracksNextEviction) {
  V8CodeSymbolTable table;
  auto ingest = [&table](uint64_t timestamp, uintptr_t start) {
    table.Ingest(MakeCodeEventInfo(timestamp,
                                  v8::CodeEventType::kFunctionType,
                                  start, 0, 0x20,
                                  "fn", "test.js", 1, 1, ""));
  };
  ingest(10, 0x1000);
  ingest(20, 0x1000);
  ingest(10, 0x2000);
  ingest(30, 0x2000);
  Frame frame{.addr = 0x1008, .kind = FrameKind::kV8Jit};
  ASSERT_TRUE(table.Resolve(frame.addr, 15, &frame));
  ASSERT_TRUE(table.Resolve(0x2008, 15, &frame));

  table.EvictClosed(20);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 2U);
  EXPECT_EQ(table.ResolutionCacheEntryCount(), 2U);
  table.EvictClosed(21);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 1U);
  EXPECT_EQ(table.ResolutionCacheEntryCount(), 1U);
  EXPECT_FALSE(table.Resolve(0x1008, 15, &frame));
  table.EvictClosed(30);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 1U);
  table.EvictClosed(31);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 0U);
  EXPECT_EQ(table.ResolutionCacheEntryCount(), 0U);

  // New history must reactivate eviction after the table becomes empty.
  ingest(40, 0x1000);
  ASSERT_TRUE(table.Resolve(0x1008, 35, &frame));
  table.EvictClosed(40);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 1U);
  table.EvictClosed(41);
  EXPECT_EQ(table.ClosedCodeSymbolCount(), 0U);
  EXPECT_EQ(table.ResolutionCacheEntryCount(), 0U);
}

TEST(EBPFProfilerTest, V8CodeSymbolTableKeepsLiveCacheAcrossEviction) {
  V8CodeSymbolTable table;

  table.Ingest(MakeCodeEventInfo(10,
                                 v8::CodeEventType::kFunctionType,
                                 0x7000,
                                 0,
                                 0x20,
                                 "live_fn",
                                 "live.js",
                                 1,
                                 1,
                                 ""));

  Frame frame{.addr = 0x7008, .kind = FrameKind::kV8Jit};
  ASSERT_TRUE(table.Resolve(frame.addr, 15, &frame));
  EXPECT_EQ(table.ResolutionCacheEntryCount(), 1u);

  table.EvictClosed(100);

  EXPECT_EQ(table.ResolutionCacheEntryCount(), 1u);

  auto cache_stats = table.ConsumeResolutionCacheStats();
  EXPECT_EQ(cache_stats.hits, 0u);
  EXPECT_EQ(cache_stats.misses, 1u);
}

TEST(EBPFProfilerTest, PopulateNativeFrameInfoSkipsMissingElfAddress) {
  Mappings mappings;
  mappings.pathinfo.push_back({"/proc/self/exe", ""});
  mappings.mappings.push_back({0x1000, 0x2000, 0, 0, 0, false});

  Frame frame{.addr = 0x1234, .kind = FrameKind::kNativeMapped};

  EXPECT_FALSE(PopulateNativeFrameInfo(&frame, mappings,
                                     &mappings.mappings[0]));
}
