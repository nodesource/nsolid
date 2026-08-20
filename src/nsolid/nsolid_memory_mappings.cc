#ifdef __linux__

#include "nsolid/nsolid_memory_mappings.h"

#include <fstream>
#include <sstream>

#include "nsolid_elf_utils.h"

namespace node {
namespace nsolid {

const Mapping* Mappings::get_mapping(uintptr_t addr) const {
  for (const auto& mapping : mappings) {
    if (mapping.contains(addr)) {
      return &mapping;
    }
  }
  return nullptr;
}

size_t Mappings::get_or_add_pathname(const std::string& pathname) {
  auto it = pathname_to_index.find(pathname);
  if (it != pathname_to_index.end()) {
    return it->second;
  }

  std::string build_id;
  if (!pathname.empty()) {
    elf_utils::GetBuildId(pathname, &build_id);
  }
  size_t index = pathinfo.size();
  pathinfo.push_back({pathname, std::move(build_id)});
  pathname_to_index.emplace(pathname, index);
  return index;
}

const std::string& Mappings::get_pathname(size_t index) const {
  return pathinfo.at(index).pathname;
}

const std::string& Mappings::get_build_id(size_t index) const {
  return pathinfo.at(index).build_id;
}

bool ProcessMemoryMappings::ParseAddressRange(const std::string& range,
                                              uintptr_t* start,
                                              uintptr_t* end) {
  const size_t dash = range.find('-');
  if (dash == std::string::npos || dash == 0 || dash + 1 == range.size()) {
    return false;
  }

  std::istringstream begin(range.substr(0, dash));
  std::istringstream finish(range.substr(dash + 1));
  begin >> std::hex >> *start;
  finish >> std::hex >> *end;
  return begin.eof() && finish.eof() && *start < *end;
}

bool ProcessMemoryMappings::Read(pid_t pid, Mappings* mappings) {
  if (mappings == nullptr) {
    return false;
  }

  mappings->mappings.clear();
  mappings->pathinfo.clear();
  mappings->pathname_to_index.clear();

  std::ifstream maps_file("/proc/" + std::to_string(pid) + "/maps");
  if (!maps_file) {
    return false;
  }

  std::string line;
  while (std::getline(maps_file, line)) {
    std::istringstream iss(line);
    std::string addr_range, permissions, offset_str, dev, inode, pathname;
    if (!(iss >> addr_range >> permissions >> offset_str >> dev >> inode)) {
      continue;
    }
    std::getline(iss, pathname);

    uintptr_t start;
    uintptr_t end;
    uintptr_t file_offset;
    if (!ParseAddressRange(addr_range, &start, &end)) {
      continue;
    }
    std::istringstream offset(offset_str);
    offset >> std::hex >> file_offset;
    if (!offset || !offset.eof()) {
      continue;
    }

    const size_t first = pathname.find_first_not_of(' ');
    const std::string clean_path = first == std::string::npos ?
        std::string() : pathname.substr(first);
    if (clean_path.empty() || clean_path[0] == '[') {
      continue;
    }

    mappings->mappings.push_back({
        start, end, file_offset, mappings->get_or_add_pathname(clean_path)});
  }
  return true;
}

}  // namespace nsolid
}  // namespace node

#endif  // __linux__
