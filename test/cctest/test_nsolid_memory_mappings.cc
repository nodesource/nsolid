#ifdef __linux__

#include <unistd.h>
#include <algorithm>

#include "nsolid/nsolid_memory_mappings.h"

#include "gtest/gtest.h"

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

TEST(NsolidMemoryMappingsTest, IgnoresPseudoMappings) {
  Mappings mappings;
  ASSERT_TRUE(ProcessMemoryMappings::Read(getpid(), &mappings));

  // This address is in the current process stack mapping ([stack]).
  EXPECT_EQ(mappings.get_mapping(
                reinterpret_cast<uintptr_t>(&mappings)), nullptr);
}

TEST(NsolidMemoryMappingsTest, RejectsInvalidInputs) {
  EXPECT_FALSE(ProcessMemoryMappings::Read(getpid(), nullptr));
  Mappings mappings;
  EXPECT_FALSE(ProcessMemoryMappings::Read(-1, &mappings));
}
#endif  // __linux__
