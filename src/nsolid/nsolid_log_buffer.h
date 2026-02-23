#ifndef SRC_NSOLID_NSOLID_LOG_BUFFER_H_
#define SRC_NSOLID_NSOLID_LOG_BUFFER_H_

#include <cstdint>
#include <string>
#include <vector>

namespace node {
namespace nsolid {

#pragma pack(push, 1)
struct LogBufferHeader {
  uint32_t magic;
  uint32_t version;
  uint64_t capacity;
  uint64_t head;
  uint64_t tail;
  uint64_t size;
};

struct LogEntryHeader {
  uint64_t timestamp;
  uint64_t execution_id;
  uint32_t msg_len;
  uint8_t severity;
  uint8_t is_discarded;
};
#pragma pack(pop)

struct ExtractedLog {
  uint64_t timestamp;
  uint8_t severity;
  std::string msg;
};

class NSolidLogBuffer {
 public:
  NSolidLogBuffer(uint8_t* mmap_data, size_t mmap_size);
  ~NSolidLogBuffer() = default;

  void Push(uint64_t timestamp, uint64_t execution_id, uint8_t severity, const std::string& msg);
  void Discard(uint64_t execution_id);
  std::vector<ExtractedLog> Extract(uint64_t execution_id);
  std::vector<ExtractedLog> ExtractAll();
  void Clear();

 private:
  void WriteBytes(const uint8_t* data, size_t len);
  void ReadBytes(uint64_t offset, uint8_t* dest, size_t len) const;
  
  uint8_t* data_;
  size_t total_size_;
  LogBufferHeader* header_;
  uint8_t* buffer_; 
};

}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_NSOLID_LOG_BUFFER_H_
