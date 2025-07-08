#include "nsolid_elf_utils.h"
#include "nsolid_util.h"

#include <fcntl.h>
#include <libelf.h>
#include <gelf.h>
#include <unistd.h>
#include <cstring>
#include <map>
#include "uv.h"

namespace node {
namespace nsolid {
namespace elf_utils {


int GetBuildId(const std::string& path, std::string* build_id) {
  static std::map<std::string, std::string> build_id_cache_;

  Elf* e;
  Elf_Scn* scn = nullptr;
  GElf_Shdr shdr;

  if (build_id_cache_.find(path) != build_id_cache_.end()) {
    *build_id = build_id_cache_[path];
    return 0;
  }

  int ret;

  ret = 0;
  if (elf_version(EV_CURRENT) == EV_NONE) {
    return elf_errno();
  }

  int fd = open(path.c_str(), O_RDONLY);
  if (fd < 0) {
    return -errno;
  }

  e = elf_begin(fd, ELF_C_READ, nullptr);
  if (!e) {
    ret = elf_errno();
    goto error;
  }

  size_t shstrndx;
  if (elf_getshdrstrndx(e, &shstrndx) != 0) {
    ret = elf_errno();
    goto end_error;
  }

  *build_id = std::string("");
  while ((scn = elf_nextscn(e, scn)) != nullptr) {
    if (gelf_getshdr(scn, &shdr) != &shdr) {
      ret = elf_errno();
      goto end_error;
    }

    char* name = elf_strptr(e, shstrndx, shdr.sh_name);
    if (name && strcmp(name, ".note.gnu.build-id") == 0) {
      Elf_Data* data = elf_getdata(scn, nullptr);
      if (data && data->d_size >= 16) {
        // ELF Note header: namesz(4), descsz(4), type(4) + name padding
        // Compute offset to build-id properly
        uint32_t* note = reinterpret_cast<uint32_t*>(data->d_buf);
        uint32_t namesz = note[0];
        uint32_t descsz = note[1];
        // Name starts at offset 12
        // Descriptor (build-id) starts at next aligned offset
        size_t name_end = 12 + ((namesz + 3) & ~3);
        uint8_t* id = reinterpret_cast<uint8_t*>(data->d_buf) + name_end;
        *build_id = utils::buffer_to_hex(id, descsz);
        break;
      }
    }
  }

  if (build_id->empty()) {
    ret = UV_ENOENT;
  } else {
    build_id_cache_[path] = *build_id;
  }

end_error:
  elf_end(e);

error:
  close(fd);

  return ret;
}

}  // namespace elf_utils
}  // namespace nsolid
}  // namespace node

