#include "nsolid/nsolid_log_buffer.h"
#include "gtest/gtest.h"
#include <vector>

namespace node {
namespace nsolid {

TEST(NSolidLogBuffer, BasicPushAndExtract) {
  size_t buffer_size = 1024 * 1024; // 1MB
  std::vector<uint8_t> mmap_data(buffer_size, 0);

  NSolidLogBuffer buffer(mmap_data.data(), mmap_data.size());

  buffer.Push(1000, 1, 30, "Test log message 1");
  buffer.Push(1001, 2, 40, "Test log message 2");
  buffer.Push(1002, 1, 50, "Test log message 3");

  auto extracted1 = buffer.Extract(1);
  EXPECT_EQ(extracted1.size(), 2);
  EXPECT_EQ(extracted1[0].msg, "Test log message 1");
  EXPECT_EQ(extracted1[1].msg, "Test log message 3");

  auto extracted2 = buffer.Extract(2);
  EXPECT_EQ(extracted2.size(), 1);
  EXPECT_EQ(extracted2[0].msg, "Test log message 2");
}

TEST(NSolidLogBuffer, WrapAround) {
  size_t buffer_size = sizeof(LogBufferHeader) + 100;
  std::vector<uint8_t> mmap_data(buffer_size, 0);

  NSolidLogBuffer buffer(mmap_data.data(), mmap_data.size());

  // Fill up the buffer
  buffer.Push(1000, 1, 30, "A somewhat long message that takes up space");
  buffer.Push(1001, 1, 30, "Another message to force wrap around");

  auto extracted = buffer.ExtractAll();
  EXPECT_EQ(extracted.size(), 1);
  EXPECT_EQ(extracted[0].msg, "Another message to force wrap around");
}

}  // namespace nsolid
}  // namespace node
