#ifndef SRC_NSOLID_NSOLID_ELF_UTILS_H_
#define SRC_NSOLID_NSOLID_ELF_UTILS_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include <string>

namespace node {
namespace nsolid {

namespace elf_utils {
  int GetBuildId(const std::string& path, std::string* build_id);
}  // namespace elf_utils
}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_NSOLID_ELF_UTILS_H_
