#ifndef AGENTS_GRPC_SRC_GRPC_UTILS_H_
#define AGENTS_GRPC_SRC_GRPC_UTILS_H_

#include "debug_utils-inl.h"
#include "google/protobuf/util/json_util.h"
#include "nlohmann/json.hpp"

using google::protobuf::Message;
using google::protobuf::util::MessageToJsonString;

namespace node {
namespace nsolid {
namespace grpc {

template <typename... Args>
inline void Debug(Args&&... args) {
  per_process::Debug(DebugCategory::NSOLID_GRPC_AGENT,
                     std::forward<Args>(args)...);
}

inline void DebugJSON(const char* str, const nlohmann::json& msg) {
  if (per_process::enabled_debug_list.enabled(
        DebugCategory::NSOLID_GRPC_AGENT)) {
    Debug(str, msg.dump(4).c_str());
  }
}

template <typename... Args>
inline void DebugProtobufMsg(const char* format,
                             const Message& msg,
                             Args&&... args) {
  if (per_process::enabled_debug_list.enabled(
        DebugCategory::NSOLID_GRPC_AGENT)) {
    std::string json_payload;
    const auto status = MessageToJsonString(msg, &json_payload);
    if (status.ok()) {
      // Build complete message with format args + JSON
      std::string formatted_prefix;
      if constexpr (sizeof...(args) > 0) {
        char buffer[512];
        snprintf(buffer, sizeof(buffer), format, std::forward<Args>(args)...);
        formatted_prefix = buffer;
      } else {
        formatted_prefix = format;
      }
      Debug("%s%s\n", formatted_prefix.c_str(), json_payload.c_str());
      return;
    }
  }
}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_GRPC_UTILS_H_
