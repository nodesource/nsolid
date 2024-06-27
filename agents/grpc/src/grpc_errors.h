#ifndef AGENTS_GRPC_SRC_GRPC_ERRORS_H_
#define AGENTS_GRPC_SRC_GRPC_ERRORS_H_

#define GRPC_ERRORS(X)                                                           \
  X(EInfoParsingError, 500, "Internal Runtime Error", 1000)                      \
  X(EInProgressError, 409, "Operation already in progress", 1001)                \
  X(EThreadGoneError, 410, "Thread already gone", 1002)                          \
  X(EProfSnapshotError, 500, "Profile/Snapshot creation failure", 1003)          \
  X(ESnapshotDisabled, 500, "Heap Snapshots disabled", 1004)                     \
  X(ENoMemory, 500, "Internal Runtime Error", 1005)                              \
  X(ENotAvailable, 404, "Resource not available", 1006)

namespace node {
namespace nsolid {
namespace grpc {

struct ErrorStor {
  uint32_t code;
  std::string message;
};

enum class ErrorType {
  ESuccess = 0,
  EUnknown = 1,
#define X(type, code, str, runtime_code) type,
  GRPC_ERRORS(X)
#undef X
};

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_GRPC_ERRORS_H_
