#include "nsolid/lru_map.h"

#include "gtest/gtest.h"

#define NANOS_PER_SEC 1000000000

using node::nsolid::LRUMap;

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
