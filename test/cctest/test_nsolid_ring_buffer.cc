#include "gtest/gtest.h"
#include "nsolid/nsolid_util.h"

using node::nsolid::utils::RingBuffer;

TEST(RingBufferTest, Basic) {
  // Create a buffer of size 3.
  RingBuffer<int> buffer(3);

  // Test that the buffer is initially empty.
  EXPECT_TRUE(buffer.empty());

  // Push some elements into the buffer.
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);

  // Test that the buffer is not empty.
  EXPECT_FALSE(buffer.empty());

  // Test that the front of the buffer is the first element pushed.
  EXPECT_EQ(buffer.front(), 1);

  // Pop an element and test that the front of the buffer is the second element
  // pushed.
  buffer.pop();
  EXPECT_EQ(buffer.front(), 2);

  // Push another element and test that the front of the buffer is still the
  // second element pushed.
  buffer.push(4);
  EXPECT_EQ(buffer.front(), 2);

  // Push another element. This should cause the second element to be popped
  // (since the buffer size is 3), so the front of the buffer should now be the
  // third element pushed.
  buffer.push(5);
  EXPECT_EQ(buffer.front(), 3);
}
