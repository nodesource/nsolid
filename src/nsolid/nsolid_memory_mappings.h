#ifndef SRC_NSOLID_NSOLID_MEMORY_MAPPINGS_H_
#define SRC_NSOLID_NSOLID_MEMORY_MAPPINGS_H_

#ifdef __linux__

#include <sys/types.h>
#include <cstddef>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace node {
namespace nsolid {

struct PathInfo {
  std::string pathname;
  std::string build_id;
};

struct Mapping {
  uintptr_t start;
  uintptr_t end;
  uintptr_t file_offset;
  size_t pathname_index;
  uintptr_t elf_vaddr = 0;
  bool has_elf_vaddr = false;

  bool contains(uintptr_t addr) const {
    return addr >= start && addr < end;
  }

  uintptr_t elf_address_for(uintptr_t addr) const {
    return elf_vaddr + (addr - start);
  }
};

struct Mappings {
  // Returns the file-backed mapping containing addr, or nullptr if unmapped.
  const Mapping* get_mapping(uintptr_t addr) const;
  // Returns the existing pathname index or adds the pathname and its build ID.
  size_t get_or_add_pathname(const std::string& pathname);
  // Returns the pathname associated with a pathname index.
  const std::string& get_pathname(size_t index) const;
  // Returns the build ID associated with a pathname index.
  const std::string& get_build_id(size_t index) const;

  std::vector<Mapping> mappings;
  std::vector<PathInfo> pathinfo;
  std::unordered_map<std::string, size_t> pathname_to_index;
};

// Used from the EnvList thread. Read() and the underlying ELF build-ID cache
// are not thread-safe.
class ProcessMemoryMappings {
 public:
  // Reads /proc/<pid>/maps, replacing any existing contents.
  // Returns false if mappings is null or the file cannot be read.
  static bool Read(pid_t pid, Mappings* mappings);

 private:
  static bool ParseAddressRange(const std::string& range,
                                uintptr_t* start,
                                uintptr_t* end);
};

}  // namespace nsolid
}  // namespace node

#endif  // __linux__

#endif  // SRC_NSOLID_NSOLID_MEMORY_MAPPINGS_H_
