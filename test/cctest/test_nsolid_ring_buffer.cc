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

TEST(RingBufferTest, ResizeToSameCapacity) {
  // Create a buffer of size 3.
  RingBuffer<int> buffer(3);

  // Add some elements.
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);

  // Resize to same capacity - should be a no-op.
  buffer.resize(3);

  // Buffer should be unchanged.
  EXPECT_FALSE(buffer.empty());
  EXPECT_EQ(buffer.front(), 1);

  // Pop and verify all elements are still there.
  buffer.pop();
  EXPECT_EQ(buffer.front(), 2);
  buffer.pop();
  EXPECT_EQ(buffer.front(), 3);
  buffer.pop();
  EXPECT_TRUE(buffer.empty());
}

TEST(RingBufferTest, ResizeLargerEmpty) {
  // Create a buffer of size 3.
  RingBuffer<int> buffer(3);

  // Resize empty buffer to larger capacity.
  buffer.resize(6);

  // Buffer should still be empty.
  EXPECT_TRUE(buffer.empty());

  // Should be able to push more elements than original capacity.
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);
  buffer.push(4);
  buffer.push(5);
  buffer.push(6);

  // Verify all elements are there.
  EXPECT_EQ(buffer.front(), 1);
  buffer.pop();
  EXPECT_EQ(buffer.front(), 2);
  buffer.pop();
  EXPECT_EQ(buffer.front(), 3);
  buffer.pop();
  EXPECT_EQ(buffer.front(), 4);
  buffer.pop();
  EXPECT_EQ(buffer.front(), 5);
  buffer.pop();
  EXPECT_EQ(buffer.front(), 6);
  buffer.pop();
  EXPECT_TRUE(buffer.empty());
}

TEST(RingBufferTest, ResizeLargerWithElements) {
  // Create a buffer of size 3.
  RingBuffer<int> buffer(3);

  // Add some elements.
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);

  // Resize to larger capacity.
  buffer.resize(5);

  // All elements should be preserved in order.
  EXPECT_FALSE(buffer.empty());
  EXPECT_EQ(buffer.front(), 1);

  // Pop and verify original elements are still there.
  buffer.pop();
  EXPECT_EQ(buffer.front(), 2);
  buffer.pop();
  EXPECT_EQ(buffer.front(), 3);
  buffer.pop();
  EXPECT_TRUE(buffer.empty());

  // Should now be able to push more elements.
  buffer.push(4);
  buffer.push(5);
  EXPECT_EQ(buffer.front(), 4);
}

TEST(RingBufferTest, ResizeSmallerWithElements) {
  // Create a buffer of size 5.
  RingBuffer<int> buffer(5);

  // Add some elements.
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);
  buffer.push(4);
  buffer.push(5);

  // Resize to smaller capacity.
  buffer.resize(3);

  // Should keep the newest 3 elements (3, 4, 5).
  EXPECT_FALSE(buffer.empty());
  EXPECT_EQ(buffer.front(), 3);

  // Pop and verify the correct elements are kept.
  buffer.pop();
  EXPECT_EQ(buffer.front(), 4);
  buffer.pop();
  EXPECT_EQ(buffer.front(), 5);
  buffer.pop();
  EXPECT_TRUE(buffer.empty());
}

TEST(RingBufferTest, ResizeSmallerWithWrapAround) {
  // Create a buffer of size 3.
  RingBuffer<int> buffer(3);

  // Fill and wrap around the buffer.
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);
  buffer.push(4);  // This should overwrite 1
  buffer.push(5);  // This should overwrite 2

  // Current buffer should contain [3, 4, 5] with 3 at front.
  EXPECT_EQ(buffer.front(), 3);

  // Resize to smaller capacity.
  buffer.resize(2);

  // Should keep the newest 2 elements (4, 5).
  EXPECT_FALSE(buffer.empty());
  EXPECT_EQ(buffer.front(), 4);

  // Pop and verify the correct elements are kept.
  buffer.pop();
  EXPECT_EQ(buffer.front(), 5);
  buffer.pop();
  EXPECT_TRUE(buffer.empty());
}

TEST(RingBufferTest, ResizeToZeroCrashes) {
  RingBuffer<int> buffer(3);
  EXPECT_DEATH(buffer.resize(0), "");
}
