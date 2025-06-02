#ifndef SRC_NSOLID_NSOLID_BPF_H_
#define SRC_NSOLID_NSOLID_BPF_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#ifdef __linux__
#include <fcntl.h>
#include <linux/version.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/utsname.h>
#include <unistd.h>
#include <fstream>
#endif

#include <cstdint>
#include <string>

// Define these if we don't have libcap headers
#ifndef CAP_BPF
#define CAP_BPF 39
#endif

#ifndef CAP_SYS_ADMIN
#define CAP_SYS_ADMIN 21
#endif

// Try to include capability.h, but provide fallbacks if it's missing
#if __has_include(<sys/capability.h>)
#include <sys/capability.h>
#define HAS_CAPABILITY_SUPPORT 1
#else
#define HAS_CAPABILITY_SUPPORT 0
// Define minimal capability types for compilation
typedef void* cap_t;
typedef enum { CAP_CLEAR = 0, CAP_SET = 1 } cap_flag_value_t;
#define CAP_EFFECTIVE 0
inline cap_t cap_get_proc() {
  return nullptr;
}
inline int cap_get_flag(cap_t, int, int, cap_flag_value_t*) {
  return -1;
}
inline void cap_free(cap_t) {}
#endif

namespace node {
namespace nsolid {
// Define Linux-specific struct that works on all platforms
struct EBPFSupportInfo {
  bool is_supported;
  uint32_t kernel_version;
  bool bpf_jit_enabled;
  bool has_root_access;
  bool has_bpf_capability;
  bool has_sys_admin_capability;
  bool supports_perf_events;
  bool supports_kprobes;
  bool supports_uprobes;
  bool supports_tracepoints;
};

#ifdef __linux__
inline bool checkBPFJITEnabled() {
  std::ifstream bpf_jit_file("/proc/sys/net/core/bpf_jit_enable");
  if (!bpf_jit_file.is_open()) {
    return false;
  }

  std::string content;
  std::getline(bpf_jit_file, content);
  return (content == "1");
}

inline bool checkCapability(int capability) {
#if HAS_CAPABILITY_SUPPORT
  cap_t caps = cap_get_proc();
  if (caps == nullptr) {
    return false;
  }

  cap_flag_value_t value;
  if (cap_get_flag(caps, capability, CAP_EFFECTIVE, &value) == -1) {
    cap_free(caps);
    return false;
  }

  cap_free(caps);
  return (value == CAP_SET);
#else
  // Fallback: check if we're root (capabilities are a Linux feature)
  return (geteuid() == 0);
#endif
}

inline bool checkPerfEventsSupport() {
  return (access("/sys/kernel/debug/tracing/events/syscalls", F_OK) == 0) ||
         (access("/sys/kernel/tracing/events/syscalls", F_OK) == 0);
}

inline bool checkKprobesSupport() {
  return (access("/sys/kernel/debug/tracing/kprobe_events", F_OK) == 0) ||
         (access("/sys/kernel/tracing/kprobe_events", F_OK) == 0);
}

inline bool checkUprobesSupport() {
  return (access("/sys/kernel/debug/tracing/uprobe_events", F_OK) == 0) ||
         (access("/sys/kernel/tracing/uprobe_events", F_OK) == 0);
}

inline bool checkTracepointsSupport() {
  return (access("/sys/kernel/debug/tracing/events", F_OK) == 0) ||
         (access("/sys/kernel/tracing/events", F_OK) == 0);
}
#endif  // __linux__

uint32_t calculateKernelVersion();
EBPFSupportInfo detectEBPFSupport();

}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_NSOLID_BPF_H_
