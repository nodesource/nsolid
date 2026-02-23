#include "nsolid_log_buffer.h"

#include <algorithm>
#include <cstring>
#include <cstddef>

namespace node {
namespace nsolid {

#define NSLG_MAGIC 0x4E534C47
#define NSLG_VERSION 1

NSolidLogBuffer::NSolidLogBuffer(uint8_t* mmap_data, size_t mmap_size) {
  total_size_ = mmap_size;
  header_ = reinterpret_cast<LogBufferHeader*>(mmap_data);
  buffer_ = mmap_data + sizeof(LogBufferHeader);

  if (header_->magic != NSLG_MAGIC || header_->version != NSLG_VERSION) {
    header_->magic = NSLG_MAGIC;
    header_->version = NSLG_VERSION;
    header_->capacity = mmap_size - sizeof(LogBufferHeader);
    header_->head = 0;
    header_->tail = 0;
    header_->size = 0;
  }
}

void NSolidLogBuffer::WriteBytes(const uint8_t* data, size_t len) {
  size_t first_part = std::min(len, static_cast<size_t>(header_->capacity - header_->tail));
  memcpy(buffer_ + header_->tail, data, first_part);
  if (first_part < len) {
    memcpy(buffer_, data + first_part, len - first_part);
  }
  header_->tail = (header_->tail + len) % header_->capacity;
}

void NSolidLogBuffer::ReadBytes(uint64_t offset, uint8_t* dest, size_t len) const {
  offset %= header_->capacity;
  size_t first_part = std::min(len, static_cast<size_t>(header_->capacity - offset));
  memcpy(dest, buffer_ + offset, first_part);
  if (first_part < len) {
    memcpy(dest + first_part, buffer_, len - first_part);
  }
}

void NSolidLogBuffer::Push(uint64_t timestamp, uint64_t execution_id, uint8_t severity, const std::string& msg) {
  size_t entry_size = sizeof(LogEntryHeader) + msg.size();
  
  if (entry_size > header_->capacity) return;

  while (header_->capacity - header_->size < entry_size) {
    LogEntryHeader old_entry;
    ReadBytes(header_->head, reinterpret_cast<uint8_t*>(&old_entry), sizeof(old_entry));
    size_t old_entry_size = sizeof(LogEntryHeader) + old_entry.msg_len;
    header_->head = (header_->head + old_entry_size) % header_->capacity;
    header_->size -= old_entry_size;
  }

  LogEntryHeader new_entry;
  new_entry.timestamp = timestamp;
  new_entry.execution_id = execution_id;
  new_entry.msg_len = msg.size();
  new_entry.severity = severity;
  new_entry.is_discarded = 0;

  WriteBytes(reinterpret_cast<const uint8_t*>(&new_entry), sizeof(new_entry));
  WriteBytes(reinterpret_cast<const uint8_t*>(msg.data()), msg.size());
  
  header_->size += entry_size;
}

void NSolidLogBuffer::Discard(uint64_t execution_id) {
  uint64_t current = header_->head;
  uint64_t read_size = 0;

  while (read_size < header_->size) {
    LogEntryHeader entry;
    ReadBytes(current, reinterpret_cast<uint8_t*>(&entry), sizeof(entry));
    
    if (entry.execution_id == execution_id && !entry.is_discarded) {
      uint8_t discarded = 1;
      uint64_t discard_offset = (current + offsetof(LogEntryHeader, is_discarded)) % header_->capacity;
      buffer_[discard_offset] = discarded;
    }
    
    uint64_t entry_size = sizeof(LogEntryHeader) + entry.msg_len;
    current = (current + entry_size) % header_->capacity;
    read_size += entry_size;
  }
}

std::vector<ExtractedLog> NSolidLogBuffer::Extract(uint64_t execution_id) {
  std::vector<ExtractedLog> extracted;
  uint64_t current = header_->head;
  uint64_t read_size = 0;

  while (read_size < header_->size) {
    LogEntryHeader entry;
    ReadBytes(current, reinterpret_cast<uint8_t*>(&entry), sizeof(entry));
    
    if (entry.execution_id == execution_id && !entry.is_discarded) {
      std::string msg(entry.msg_len, '\0');
      ReadBytes((current + sizeof(LogEntryHeader)) % header_->capacity, 
                reinterpret_cast<uint8_t*>(&msg[0]), entry.msg_len);
      extracted.push_back({entry.timestamp, entry.severity, std::move(msg)});
      
      uint8_t discarded = 1;
      uint64_t discard_offset = (current + offsetof(LogEntryHeader, is_discarded)) % header_->capacity;
      buffer_[discard_offset] = discarded;
    }
    
    uint64_t entry_size = sizeof(LogEntryHeader) + entry.msg_len;
    current = (current + entry_size) % header_->capacity;
    read_size += entry_size;
  }
  return extracted;
}

std::vector<ExtractedLog> NSolidLogBuffer::ExtractAll() {
  std::vector<ExtractedLog> extracted;
  uint64_t current = header_->head;
  uint64_t read_size = 0;

  while (read_size < header_->size) {
    LogEntryHeader entry;
    ReadBytes(current, reinterpret_cast<uint8_t*>(&entry), sizeof(entry));
    
    if (!entry.is_discarded) {
      std::string msg(entry.msg_len, '\0');
      ReadBytes((current + sizeof(LogEntryHeader)) % header_->capacity, 
                reinterpret_cast<uint8_t*>(&msg[0]), entry.msg_len);
      extracted.push_back({entry.timestamp, entry.severity, std::move(msg)});
    }
    
    uint64_t entry_size = sizeof(LogEntryHeader) + entry.msg_len;
    current = (current + entry_size) % header_->capacity;
    read_size += entry_size;
  }
  return extracted;
}

void NSolidLogBuffer::Clear() {
  header_->head = 0;
  header_->tail = 0;
  header_->size = 0;
}

}  // namespace nsolid
}  // namespace node
