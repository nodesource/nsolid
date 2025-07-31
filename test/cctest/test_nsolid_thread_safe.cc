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
