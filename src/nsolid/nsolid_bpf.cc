#include "nsolid_bpf.h"
#include "nsolid_api.h"

#ifdef __linux__
#include "libbpf.h"
#endif

#include <string>
#include <vector>

namespace node {
namespace nsolid {

EbpfLoader::EbpfLoader() {}

EbpfLoader::~EbpfLoader() {
  CleanupAllBpfObjects();
}

EBPFSupportInfo detectEBPFSupport() {
  static EBPFSupportInfo cached_info = {.is_supported = false,
                                        .bpf_jit_enabled = false,
                                        .has_root_access = false,
                                        .has_bpf_capability = false,
                                        .has_sys_admin_capability = false,
                                        .supports_perf_events = false,
                                        .supports_kprobes = false,
                                        .supports_uprobes = false,
                                        .supports_tracepoints = false};
  static bool initialized = false;

  if (initialized) {
    return cached_info;
  }

  EBPFSupportInfo& info = cached_info;

#ifdef __linux__
  auto kernel_version = calculateKernelVersion();
  uint32_t major = kernel_version >> 16;
  uint32_t minor = (kernel_version >> 8) & 0xFF;

  // Kernel 4.9+ has basic eBPF support
  if (major > 4 || (major == 4 && minor >= 9)) {
    info.is_supported = true;
  } else {
    return info;
  }

  // Check BPF JIT compiler
  info.bpf_jit_enabled = checkBPFJITEnabled();
  info.has_root_access = (geteuid() == 0);

  // Check capabilities
  info.has_bpf_capability = checkCapability(CAP_BPF);
  info.has_sys_admin_capability = checkCapability(CAP_SYS_ADMIN);

  // Check specific eBPF features
  info.supports_perf_events = checkPerfEventsSupport();
  info.supports_kprobes = checkKprobesSupport();
  info.supports_uprobes = checkUprobesSupport();
  info.supports_tracepoints = checkTracepointsSupport();
#endif  // defined(__linux__)

  initialized = true;

  return info;
}

void EbpfLoader::CleanupAllBpfObjects() {
#ifdef __linux__
#define V(_, key, __)                                                          \
  if (key##_skel_ != nullptr) key##_bpf__destroy(key##_skel_);
  EBPF_PROGRAMS(V)
#undef V
#endif
}

EbpfLoadStatus EbpfLoader::LoadHelloWorld() {
#ifdef __linux__
  hello_world_skel_ = hello_world_bpf__open_and_load();
  if (!hello_world_skel_) {
    return EbpfLoadStatus::LOAD_ERROR;
  }
#else
  return EbpfLoadStatus::NOT_SUPPORTED;
#endif
  return EbpfLoadStatus::SUCCESS;
}

}  // namespace nsolid
}  // namespace node
