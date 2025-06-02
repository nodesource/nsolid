#include "nsolid_bpf.h"
#include "nsolid_api.h"

namespace node {
namespace nsolid {

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

#if defined(__linux__)
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

}  // namespace nsolid
}  // namespace node
