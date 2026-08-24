#ifndef SRC_NSOLID_NSOLID_BPF_H_
#define SRC_NSOLID_NSOLID_BPF_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#ifdef __linux__
#include "ebpf/profiler/profiler.skel.h"
#endif

namespace node {
namespace nsolid {

enum class EbpfLoadStatus {
  SUCCESS,
  LOAD_ERROR,
  NOT_SUPPORTED,
};

namespace EbpfLoader {

#ifdef __linux__
profiler_bpf* LoadProfiler(EbpfLoadStatus& status);
#endif

}  // namespace EbpfLoader

}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_NSOLID_BPF_H_
