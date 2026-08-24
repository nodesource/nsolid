#include "nsolid_bpf.h"

namespace node {
namespace nsolid {
namespace EbpfLoader {

#ifdef __linux__
profiler_bpf* LoadProfiler(EbpfLoadStatus& status) {
  profiler_bpf* profiler = profiler_bpf__open();
  if (profiler == nullptr) {
    status = EbpfLoadStatus::LOAD_ERROR;
    return nullptr;
  }

  if (profiler_bpf__load(profiler) != 0) {
    profiler_bpf__destroy(profiler);
    status = EbpfLoadStatus::LOAD_ERROR;
    return nullptr;
  }

  status = EbpfLoadStatus::SUCCESS;
  return profiler;
}
#endif

}  // namespace EbpfLoader
}  // namespace nsolid
}  // namespace node
