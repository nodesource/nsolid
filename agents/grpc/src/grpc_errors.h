#ifndef AGENTS_GRPC_SRC_GRPC_ERRORS_H_
#define AGENTS_GRPC_SRC_GRPC_ERRORS_H_

#define GRPC_ERRORS(X)                                                           \
  X(EInfoParsingError, 500, "Internal Runtime Error", 1000)                      \
  X(ECPUProfInProgressError, 409, "'cpu_profile' already in progress", 1001)     \
  X(EHeapProfInProgressError, 409, "'heap_profile' already in progress", 1002)   \
  X(EHeapSamplInProgressError, 409, "'heap_sampling' already in progress", 1003) \
  X(EHeapSnapProgressError, 409, "'heap_snapshot' already in progress", 1004)

namespace node {
namespace nsolid {
namespace grpc {

struct ErrorStor {
  uint32_t code;
  std::string message;
};

enum class ErrorType {
#define X(type, code, str, runtime_code) type,
  GRPC_ERRORS(X)
#undef X
};

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_GRPC_ERRORS_H_
