#include "nsolid/thread_safe.h"

#include "gtest/gtest.h"

using node::nsolid::TSList;

TEST(TSListTest, ObjectIterator) {
  TSList<int> list;
  auto it1 = list.push_back(1);
  auto it2 = list.push_back(2);
  auto it3 = list.push_back(3);
  int i = 0;
  list.for_each([&i](const int& v) {
    EXPECT_EQ(v, ++i);
  });

  list.erase(it2);
  i = 0;
  list.for_each([&i](const int& v) {
    ++i;
    if (i == 1) {
      EXPECT_EQ(v, 1);
    } else if (i == 2) {
      EXPECT_EQ(v, 3);
    } else {
      EXPECT_FALSE(i);
    }
  });

  auto it4 = list.push_back(4);
  i = 0;
  list.for_each([&i](const int& v) {
    ++i;
    if (i == 1) {
      EXPECT_EQ(v, 1);
    } else if (i == 2) {
      EXPECT_EQ(v, 3);
    } else if (i == 3) {
      EXPECT_EQ(v, 4);
    } else {
      EXPECT_FALSE(i);
    }
  });

  list.erase(it1);
  list.erase(it4);
  list.erase(it3);
  list.for_each([](const int& v) {
    EXPECT_TRUE(false);
  });
}

// Test TSList::for_each with size parameter (object specialization)
TEST(TSListTest, ObjectForEachWithSize) {
  TSList<int> list;
  auto it1 = list.push_back(10);
  auto it2 = list.push_back(20);
  auto it3 = list.push_back(30);
  std::vector<int> values;
  std::vector<size_t> sizes;
  list.for_each([&](const int& v, size_t size) {
    values.push_back(v);
    sizes.push_back(size);
  });
  EXPECT_EQ(values.size(), 3u);
  EXPECT_EQ(sizes[0], 3u);
  EXPECT_EQ(sizes[1], 3u);
  EXPECT_EQ(sizes[2], 3u);
  EXPECT_EQ(values[0], 10);
  EXPECT_EQ(values[1], 20);
  EXPECT_EQ(values[2], 30);
}

// Test TSList::erase returns new size (object specialization)
TEST(TSListTest, ObjectEraseReturnsSize) {
  TSList<int> list;
  auto it1 = list.push_back(1);
  auto it2 = list.push_back(2);
  auto it3 = list.push_back(3);
  EXPECT_EQ(list.erase(it2), 2u);
  EXPECT_EQ(list.erase(it1), 1u);
  EXPECT_EQ(list.erase(it3), 0u);
}

// Test TSList::for_each with size parameter (pointer specialization)
TEST(TSListTest, PointerForEachWithSize) {
  TSList<int*> list;
  auto it1 = list.push_back(new int(100));
  auto it2 = list.push_back(new int(200));
  auto it3 = list.push_back(new int(300));
  std::vector<int> values;
  std::vector<size_t> sizes;
  list.for_each([&](int* v, size_t size) {
    values.push_back(*v);
    sizes.push_back(size);
  });
  EXPECT_EQ(values.size(), 3u);
  EXPECT_EQ(sizes[0], 3u);
  EXPECT_EQ(sizes[1], 3u);
  EXPECT_EQ(sizes[2], 3u);
  EXPECT_EQ(values[0], 100);
  EXPECT_EQ(values[1], 200);
  EXPECT_EQ(values[2], 300);
  // Clean up
  int* tmp = *it1;
  delete tmp;
  tmp = *it2;
  delete tmp;
  tmp = *it3;
  delete tmp;
  list.erase(it1);
  list.erase(it2);
  list.erase(it3);
}

// Test TSList::erase returns new size (pointer specialization)
TEST(TSListTest, PointerEraseReturnsSize) {
  TSList<int*> list;
  auto it1 = list.push_back(new int(1));
  auto it2 = list.push_back(new int(2));
  auto it3 = list.push_back(new int(3));
  int* p1 = *it1;
  int* p2 = *it2;
  int* p3 = *it3;
  EXPECT_EQ(list.erase(it2), 2u);
  EXPECT_EQ(list.erase(it1), 1u);
  EXPECT_EQ(list.erase(it3), 0u);
  delete p1;
  delete p2;
  delete p3;
}

TEST(TSListTest, PointerIterator) {
  TSList<int*> list;
  auto it1 = list.push_back(new int(1));
  auto it2 = list.push_back(new int(2));
  auto it3 = list.push_back(new int(3));
  int i = 0;
  list.for_each([&i](int* v) {
    EXPECT_EQ(*v, ++i);
  });

  int* tmp = *it2;
  delete tmp;
  list.erase(it2);
  i = 0;
  list.for_each([&i](int* v) {
    ++i;
    if (i == 1) {
      EXPECT_EQ(*v, 1);
    } else if (i == 2) {
      EXPECT_EQ(*v, 3);
    } else {
      EXPECT_FALSE(i);
    }
  });

  auto it4 = list.push_back(new int(4));
  i = 0;
  list.for_each([&i](int* v) {
    ++i;
    if (i == 1) {
      EXPECT_EQ(*v, 1);
    } else if (i == 2) {
      EXPECT_EQ(*v, 3);
    } else if (i == 3) {
      EXPECT_EQ(*v, 4);
    } else {
      EXPECT_FALSE(i);
    }
  });

  tmp = *it1;
  delete tmp;
  list.erase(it1);
  tmp = *it4;
  delete tmp;
  list.erase(it4);
  tmp = *it3;
  delete tmp;
  list.erase(it3);
  list.for_each([](int* v) {
    EXPECT_TRUE(false);
  });
}
