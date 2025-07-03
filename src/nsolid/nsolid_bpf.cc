#include "nsolid_bpf.h"
#include "nsolid_api.h"

#ifdef __linux__
#include "libbpf.h"
#endif

#include <string>
#include <vector>

namespace node {
namespace nsolid {

EbpfLoader::EbpfLoader()
    : allowed_programs_({"hello_world"}),
      ebpf_program_path_("./src/ebpf/") {}

EbpfLoader::~EbpfLoader() {
  CleanupAllBpfObjects();
}

EbpfLoadStatus EbpfLoader::LoadProgram(const std::string& program_name) {
  EBPFSupportInfo info = detectEBPFSupport();

  if (!info.is_supported || !info.has_sys_admin_capability) {
    return EbpfLoadStatus::NOT_SUPPORTED;
  }

#ifdef __linux__
  if (allowed_programs_.find(program_name) == allowed_programs_.end()) {
    return EbpfLoadStatus::NOT_ALLOWED;
  }

  std::string full_path = ebpf_program_path_ + program_name + ".bpf.o";
  if (!std::filesystem::exists(full_path)) {
    return EbpfLoadStatus::FILE_NOT_FOUND;
  }

  struct bpf_object_open_opts open_opts = {};
  open_opts.sz = sizeof(struct bpf_object_open_opts);
  struct bpf_object* obj;
  int err;

  obj = bpf_object__open_file(full_path.c_str(), &open_opts);
  if (!obj) {
    err = -errno;
    return EbpfLoadStatus::LOAD_ERROR;
  }

  err = bpf_object__load(obj);
  if (err) {
    bpf_object__close(obj);
    return EbpfLoadStatus::LOAD_ERROR;
  }

  loaded_objects_.push_back(obj);

  return EbpfLoadStatus::SUCCESS;
#else
  return EbpfLoadStatus::NOT_SUPPORTED;
#endif  // __linux__
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
  for (struct bpf_object* obj : loaded_objects_) {
    if (obj != nullptr) {
      bpf_object__close(obj);
    }
  }
  loaded_objects_.clear();
#endif
}

}  // namespace nsolid
}  // namespace node
