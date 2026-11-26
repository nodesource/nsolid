#include "nsolid/lru_map.h"
#include "nsolid/nsolid_metrics.h"

#include "gtest/gtest.h"

#include <vector>

#define NANOS_PER_SEC 1000000000

using node::nsolid::LRUMap;
using node::nsolid::MergeHistogramPoints;
using node::nsolid::PointDataAttributesVector;
using node::nsolid::SharedPointDataAttributes;

static int count = 0;

struct A {
  int b;
  int c;
};

void expiration_cb(A a) {
  switch (++count) {
    case 1:
      EXPECT_EQ(a.b, 1);
      EXPECT_EQ(a.c, 2);
    break;

    case 2:
      EXPECT_EQ(a.b, 5);
      EXPECT_EQ(a.c, 6);
    break;

    case 3:
      EXPECT_EQ(a.b, 7);
      EXPECT_EQ(a.c, 8);
    break;
  }
}

TEST(LRUMapTest, Basic) {
  LRUMap<int, A> map(NANOS_PER_SEC / 2, expiration_cb);
  map.insert(0, A{ 1, 2 });
  EXPECT_EQ(map.size(), 1U);
  EXPECT_TRUE(map.find(1) != map.begin());
  EXPECT_TRUE(map.find(1) == map.end());
  auto it = map.begin();
  const A& a = it->second;
  EXPECT_EQ(a.b, 1);
  EXPECT_EQ(a.c, 2);
  map.clean();
  EXPECT_EQ(map.size(), 1U);
  EXPECT_EQ(count, 0);
  uv_sleep(1000);
  map.clean();
  EXPECT_EQ(map.size(), 0U);
  EXPECT_TRUE(map.begin() == map.end());
  EXPECT_EQ(count, 1);
  map.insert(1, A{ 3, 4 });
  A a1{ 5, 6 };
  map.insert(2, std::move(a1));
  a1.b = 7;
  a1.c = 8;
  map.insert(3, std::move(a1));
  EXPECT_EQ(map.size(), 3U);
  EXPECT_EQ(map.erase(1), 1U);
  EXPECT_EQ(map.size(), 2U);
  uv_sleep(1000);
  map.clean();
  EXPECT_EQ(map.size(), 0U);
  EXPECT_TRUE(map.begin() == map.end());
  EXPECT_EQ(count, 3);
}

TEST(LRUMapTest, MaxSize) {
  int evicted = 0;
  int last_evicted = -1;
  LRUMap<int, int> map(60UL * NANOS_PER_SEC, [&](int value) {
    ++evicted;
    last_evicted = value;
  });
  map.set_max_size(3);
  for (int i = 0; i < 3; i++) {
    map.insert(i, i * 10);
  }
  EXPECT_EQ(map.size(), 3U);
  EXPECT_EQ(evicted, 0);
  // Removing an entry from the middle keeps the others in order.
  EXPECT_EQ(map.erase(1), 1U);
  map.insert(3, 30);
  EXPECT_EQ(evicted, 0);
  // The oldest entry left, 0, makes room for 4, then 2 for 5.
  map.insert(4, 40);
  EXPECT_EQ(evicted, 1);
  EXPECT_EQ(last_evicted, 0);
  EXPECT_TRUE(map.find(0) == map.end());
  map.insert(5, 50);
  EXPECT_EQ(evicted, 2);
  EXPECT_EQ(last_evicted, 20);
  EXPECT_EQ(map.size(), 3U);
  EXPECT_EQ(map.erase(1), 0U);
}

TEST(LRUMapTest, CleanKeepsNewerEntries) {
  std::vector<int> expired;
  LRUMap<int, int>* map_ptr = nullptr;
  LRUMap<int, int> map(NANOS_PER_SEC / 10, [&](int value) {
    // An entry inserted while clean() runs is newer than its start time, so
    // it must be kept.
    if (expired.empty()) {
      map_ptr->insert(2, 20);
    }
    expired.push_back(value);
  });
  map_ptr = &map;
  map.insert(0, 0);
  map.insert(1, 10);
  uv_sleep(200);
  map.clean();
  EXPECT_EQ(expired, (std::vector<int>{0, 10}));
  ASSERT_EQ(map.size(), 1U);
  EXPECT_EQ(map.begin()->first, 2);
  EXPECT_EQ(map.begin()->second, 20);
}

static opentelemetry::sdk::metrics::PointDataAttributes makeHistogramPoint(
    const char* address) {
  using opentelemetry::sdk::metrics::Base2ExponentialHistogramAggregation;
  using opentelemetry::sdk::metrics::Base2ExponentialHistogramPointData;
  using opentelemetry::sdk::metrics::MetricAttributes;
  Base2ExponentialHistogramAggregation aggregation;
  aggregation.Aggregate(1.0);
  auto point = aggregation.ToPoint();
  auto* histogram =
      opentelemetry::nostd::get_if<Base2ExponentialHistogramPointData>(&point);
  MetricAttributes attributes;
  attributes.insert({"server.address", address});
  return {attributes, std::move(*histogram)};
}

TEST(NsolidHistogramMergeTest, LimitsDisjointAttributesAcrossWindows) {
  using opentelemetry::sdk::metrics::Base2ExponentialHistogramPointData;
  using opentelemetry::sdk::metrics::GetOverflowAttributes;
  SharedPointDataAttributes accumulated =
      std::make_shared<PointDataAttributesVector>();

  for (const char* address : {"one", "two", "three", "four", "five", "six"}) {
    auto next = std::make_shared<PointDataAttributesVector>();
    next->push_back(makeHistogramPoint(address));
    MergeHistogramPoints(accumulated, next, 2);
  }

  ASSERT_EQ(accumulated->size(), 3U);
  uint64_t total_count = 0;
  bool has_overflow = false;
  for (const auto& point : *accumulated) {
    const auto* histogram =
        opentelemetry::nostd::get_if<Base2ExponentialHistogramPointData>(
            &point.point_data);
    ASSERT_NE(histogram, nullptr);
    total_count += histogram->count_;
    has_overflow |= point.attributes == GetOverflowAttributes();
  }
  EXPECT_EQ(total_count, 6U);
  EXPECT_TRUE(has_overflow);
}
