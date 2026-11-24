#include "nsolid/nsolid_util.h"
#include "nsolid/thread_safe.h"

#include <array>
#include <cstring>
#include <set>

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
  list.push_back(10);
  list.push_back(20);
  list.push_back(30);
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

TEST(NsolidRandomTest, TracingIdentifiers) {
  const std::array<uint64_t, 3> expected = {8388677, 33554692, 70368777736387};
  for (size_t size : {8U, 16U, 20U}) {
    std::array<uint64_t, 2> state = {1, 2};
    std::array<unsigned char, 22> output;
    output.fill(0xa5);
    node::nsolid::utils::generate_random_buf(output.data() + 1, size, &state);
    EXPECT_EQ(std::memcmp(output.data() + 1, expected.data(), size), 0);
    EXPECT_EQ(output.front(), 0xa5);
    for (size_t i = size + 1; i < output.size(); ++i) {
      EXPECT_EQ(output[i], 0xa5);
    }
  }
}

TEST(NsolidRandomTest, ConcurrentIdentifiers) {
  std::array<uv_thread_t, 8> threads;
  std::array<std::vector<std::string>, 8> values;
  for (size_t i = 0; i < threads.size(); ++i) {
    const int status = uv_thread_create(
        &threads[i],
        +[](void* data) {
          auto* ids = static_cast<std::vector<std::string>*>(data);
          for (size_t n = 0; n < 256; ++n) {
            ids->push_back(node::nsolid::utils::generate_unique_id());
          }
        },
        &values[i]);
    if (status != 0) {
      for (size_t j = 0; j < i; ++j) {
        uv_thread_join(&threads[j]);
      }
      FAIL() << uv_strerror(status);
    }
  }
  for (auto& thread : threads) {
    ASSERT_EQ(0, uv_thread_join(&thread));
  }
  std::set<std::string> unique;
  for (const auto& ids : values) {
    for (const auto& id : ids) {
      EXPECT_EQ(id.size(), 40U);
      EXPECT_EQ(id.find_first_not_of("0123456789abcdef"), std::string::npos);
      EXPECT_TRUE(unique.insert(id).second);
    }
  }
}
