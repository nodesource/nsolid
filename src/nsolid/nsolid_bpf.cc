#include "nsolid_bpf.h"

#include <sys/stat.h>

namespace node {
namespace nsolid {
namespace EbpfLoader {

profiler_bpf* LoadProfiler(EbpfLoadStatus& status) {
  struct stat pid_ns;
  if (stat("/proc/self/ns/pid", &pid_ns) != 0) {
    status = EbpfLoadStatus::LOAD_ERROR;
    return nullptr;
  }

  profiler_bpf* profiler = profiler_bpf__open();
  if (profiler == nullptr) {
    status = EbpfLoadStatus::LOAD_ERROR;
    return nullptr;
  }

  profiler->rodata->pid_ns_dev = pid_ns.st_dev;
  profiler->rodata->pid_ns_ino = pid_ns.st_ino;
  if (profiler_bpf__load(profiler) != 0) {
    profiler_bpf__destroy(profiler);
    status = EbpfLoadStatus::LOAD_ERROR;
    return nullptr;
  }

  status = EbpfLoadStatus::SUCCESS;
  return profiler;
}

}  // namespace EbpfLoader
}  // namespace nsolid
}  // namespace node
