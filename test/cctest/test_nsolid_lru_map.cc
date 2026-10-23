#include "nsolid/lru_map.h"
#include "nsolid/nsolid_metrics.h"

#include "gtest/gtest.h"

#define NANOS_PER_SEC 1000000000

using node::nsolid::LRUMap;
using node::nsolid::MergeHttpHistogramPoints;
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

static opentelemetry::sdk::metrics::PointDataAttributes makeHttpHistogramPoint(
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

TEST(NsolidHttpHistogramMergeTest, LimitsDisjointAttributesAcrossWindows) {
  using opentelemetry::sdk::metrics::Base2ExponentialHistogramPointData;
  using opentelemetry::sdk::metrics::GetOverflowAttributes;
  SharedPointDataAttributes accumulated =
      std::make_shared<PointDataAttributesVector>();

  for (const char* address : {"one", "two", "three", "four", "five", "six"}) {
    auto next = std::make_shared<PointDataAttributesVector>();
    next->push_back(makeHttpHistogramPoint(address));
    MergeHttpHistogramPoints(accumulated, next, 2);
  }

  ASSERT_EQ(accumulated->size(), 3U);
  uint64_t total_count = 0;
  bool has_overflow = false;
  for (const auto& point : *accumulated) {
    const auto* histogram = opentelemetry::nostd::get_if<
        Base2ExponentialHistogramPointData>(&point.point_data);
    ASSERT_NE(histogram, nullptr);
    total_count += histogram->count_;
    has_overflow |= point.attributes == GetOverflowAttributes();
  }
  EXPECT_EQ(total_count, 6U);
  EXPECT_TRUE(has_overflow);
}
