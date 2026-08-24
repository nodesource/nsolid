#ifdef __linux__

#include <sys/mman.h>
#include <unistd.h>
#include <cstdio>
#include <memory>
#include <algorithm>

#include "nsolid/nsolid_api.h"
#include "nsolid/nsolid_memory_mappings.h"
#include "nsolid/nsolid_elf_utils.h"

#include "gtest/gtest.h"
#include "node_test_fixture.h"

using node::nsolid::Mappings;
using node::nsolid::ProcessMemoryMappings;

TEST(NsolidMemoryMappingsTest, ReadsCurrentProcessAndReplacesOutput) {
  Mappings mappings;
  mappings.mappings.push_back({0xdeadbeef, 0xdeadbef0, 0, 0});
  mappings.pathinfo.push_back({"stale", ""});
  mappings.pathname_to_index.emplace("stale", 0);

  ASSERT_TRUE(ProcessMemoryMappings::Read(getpid(), &mappings));
  EXPECT_FALSE(mappings.mappings.empty());
  EXPECT_EQ(std::count_if(
              mappings.mappings.begin(), mappings.mappings.end(),
              [](const auto& mapping) { return mapping.start == 0xdeadbeef; }),
            0U);
  EXPECT_EQ(std::count_if(
              mappings.pathinfo.begin(),
              mappings.pathinfo.end(),
              [](const auto& pathinfo) {
                return pathinfo.pathname == "stale";
              }), 0U);
  EXPECT_EQ(mappings.pathname_to_index.count("stale"), 0U);
}

TEST(NsolidMemoryMappingsTest, UsesLocatorForBuildId) {
  std::string build_id;
  ASSERT_EQ(node::nsolid::elf_utils::GetBuildId("/proc/self/exe",
                                                 &build_id),
            0);

  Mappings mappings;
  const size_t index = mappings.get_or_add_pathname("display-only",
                                                     "/proc/self/exe");
  EXPECT_EQ(mappings.get_pathname(index), "display-only");
  EXPECT_EQ(mappings.get_build_id(index), build_id);
}

TEST(NsolidMemoryMappingsTest, IgnoresPseudoMappings) {
  Mappings mappings;
  ASSERT_TRUE(ProcessMemoryMappings::Read(getpid(), &mappings));

  // This address is in the current process stack mapping ([stack]).
  EXPECT_EQ(mappings.get_mapping(
                reinterpret_cast<uintptr_t>(&mappings)), nullptr);
}

TEST_F(NodeZeroIsolateTestFixture, MemoryMappingWithoutElfAddress) {
  // tmpfile() unlinks its backing file, so the mapping's pathname cannot
  // be opened for ELF lookup even though the mapping remains accessible.
  std::unique_ptr<FILE, decltype(&std::fclose)> file(
      std::tmpfile(), std::fclose);
  ASSERT_NE(file, nullptr);
  const size_t size = getpagesize();
  ASSERT_EQ(ftruncate(fileno(file.get()), size), 0);
  void* addr =
      mmap(nullptr, size, PROT_READ, MAP_PRIVATE, fileno(file.get()), 0);
  ASSERT_NE(addr, MAP_FAILED);
  auto cleanup = node::OnScopeLeave([addr, size] {
    EXPECT_EQ(munmap(addr, size), 0);
  });

  struct Request {
    Mappings mappings;
    uv_sem_t done = {};
    bool read = false;
  } request;
  ASSERT_EQ(uv_sem_init(&request.done, 0), 0);
  ASSERT_EQ(node::nsolid::EnvList::Inst()->QueueCallback([](void* data) {
    auto* request = static_cast<Request*>(data);
    request->read = ProcessMemoryMappings::Read(getpid(), &request->mappings);
    uv_sem_post(&request->done);
  }, &request), 0);
  uv_sem_wait(&request.done);
  uv_sem_destroy(&request.done);

  ASSERT_TRUE(request.read);
  const auto* mapping =
      request.mappings.get_mapping(reinterpret_cast<uintptr_t>(addr));
  ASSERT_NE(mapping, nullptr);
  EXPECT_FALSE(mapping->has_elf_vaddr);
  EXPECT_EQ(mapping->elf_vaddr, 0U);
}

TEST(NsolidMemoryMappingsTest, RejectsInvalidInputs) {
  EXPECT_FALSE(ProcessMemoryMappings::Read(getpid(), nullptr));
  Mappings mappings;
  EXPECT_FALSE(ProcessMemoryMappings::Read(-1, &mappings));
}
#endif  // __linux__
