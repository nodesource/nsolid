#ifndef AGENTS_ZMQ_SRC_ZMQ_ERRORS_H_
#define AGENTS_ZMQ_SRC_ZMQ_ERRORS_H_

#define ZMQ_ERRORS(X)                                                          \
  X(ZMQ_ERROR_NO_ENDPOINT, -1000, "Endpoint not defined for '%s' channel\n")   \
  X(ZMQ_ERROR_INVALID_ENDPOINT,                                                \
    -1001,                                                                     \
    "Invalid Endpoint '%s' for '%s' channel\n")                                \
  X(ZMQ_ERROR_ENCRYPTION_ERROR,                                                \
    -1002,                                                                     \
    "Encryption Error '%s' (errno: %d) for '%s' channel\n")                    \
  X(ZMQ_ERROR_IPV6,                                                            \
    -1003,                                                                     \
    "Setting Ipv6 Error '%s' (errno: %d) for '%s' channel\n")                  \
  X(ZMQ_ERROR_HEARTBEAT,                                                       \
    -1004,                                                                     \
    "Setting heartbeat to '%d' failed with Error '%s' (errno: %d) for '%s' "   \
    "channel\n")                                                               \
  X(ZMQ_ERROR_CONNECTION,                                                      \
    -1005,                                                                     \
    "Error '%s' (errno: %d) connecting handle '%s' to endpoint '%s'\n")        \
  X(ZMQ_ERROR_SEND_COMMAND_MESSAGE,                                            \
    -1006,                                                                     \
    "Error '%s' (errno: %d) sending '%s' msg '%s' to '%s'\n")                  \
  X(ZMQ_ERROR_SEND_COMMAND_NO_DATA_HANDLE,                                     \
    -1007,                                                                     \
    "Error sending command (%s) 'no data handle''\n")

namespace node {
namespace nsolid {
namespace zmq {

enum ErrorType {
#define X(type, code, str) type = code,
  ZMQ_ERRORS(X)
#undef X
      NSOLID_ZMQ_ERROR_MAX
};

inline const char* get_error_str(ErrorType code) {
  switch (code) {
#define X(type, code, str)                                                     \
  case type:                                                                   \
    return "[" #type "] " str;
    ZMQ_ERRORS(X)
#undef X
    default:
      return nullptr;
  }
}

}  // namespace zmq
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_ZMQ_SRC_ZMQ_ERRORS_H_
