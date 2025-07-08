#include "nsolid_elf_utils.h"
#include "nsolid_api.h"
#include "nsolid_util.h"

#include <fcntl.h>
#include <elf.h>
#include <libelf.h>
#include <gelf.h>
#include <unistd.h>
#include <cstdint>
#include <cstring>
#include <limits>
#include <unordered_map>
#include "uv.h"

namespace node {
namespace nsolid {
namespace elf_utils {

namespace {

bool ParseBuildIdNotes(const void* buffer, size_t size, std::string* build_id) {
  const auto* data = static_cast<const uint8_t*>(buffer);
  for (size_t offset = 0; size - offset >= 12;) {
    uint32_t note[3];
    std::memcpy(note, data + offset, sizeof(note));
    const size_t namesz = note[0];
    const size_t descsz = note[1];
    if (namesz > size - offset - 12) return false;
    const size_t name_end = offset + 12 + ((namesz + 3) & ~size_t{3});
    if (name_end > size || descsz > size - name_end) return false;
    if (note[2] == NT_GNU_BUILD_ID && namesz >= 4 &&
        std::memcmp(data + offset + 12, "GNU", 3) == 0) {
      *build_id = utils::buffer_to_hex(data + name_end, descsz);
      return true;
    }
    const size_t next = name_end + ((descsz + 3) & ~size_t{3});
    if (next <= offset || next > size) return false;
    offset = next;
  }
  return false;
}

}  // namespace


int GetBuildId(const std::string& path, std::string* build_id) {
  static std::unordered_map<std::string, std::string> build_id_cache_;

  // Not thread-safe; call only from the EnvList thread.
  DCHECK(utils::are_threads_equal(uv_thread_self(), EnvList::Inst()->thread()));

  Elf* e;
  Elf_Scn* scn = nullptr;
  GElf_Shdr shdr;

  auto it = build_id_cache_.find(path);
  if (it != build_id_cache_.end()) {
    *build_id = it->second;
    return 0;
  }

  int ret = 0;
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

  build_id->clear();
  size_t shstrndx;
  if (elf_getshdrstrndx(e, &shstrndx) != 0 || shstrndx == SHN_UNDEF) {
    size_t phnum;
    if (elf_getphdrnum(e, &phnum) != 0) {
      ret = elf_errno();
      goto end_error;
    }
    for (size_t i = 0; i < phnum && build_id->empty(); ++i) {
      GElf_Phdr phdr;
      if (gelf_getphdr(e, static_cast<int>(i), &phdr) != &phdr) {
        ret = elf_errno();
        goto end_error;
      }
      if (phdr.p_type != PT_NOTE || phdr.p_filesz >
          std::numeric_limits<size_t>::max()) {
        continue;
      }
      Elf_Data* data = elf_getdata_rawchunk(
          e, phdr.p_offset, static_cast<size_t>(phdr.p_filesz), ELF_T_BYTE);
      if (data) {
        ParseBuildIdNotes(data->d_buf, data->d_size, build_id);
      }
    }
  } else {
    while ((scn = elf_nextscn(e, scn)) != nullptr) {
      if (gelf_getshdr(scn, &shdr) != &shdr) {
        ret = elf_errno();
        goto end_error;
      }

      char* name = elf_strptr(e, shstrndx, shdr.sh_name);
      if (name && strcmp(name, ".note.gnu.build-id") == 0) {
        Elf_Data* data = elf_getdata(scn, nullptr);
        if (data && ParseBuildIdNotes(data->d_buf, data->d_size, build_id)) {
          break;
        }
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

