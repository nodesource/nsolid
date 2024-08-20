#ifndef AGENTS_GRPC_SRC_GRPC_UTILS_H_
#define AGENTS_GRPC_SRC_GRPC_UTILS_H_

#include <nlohmann/json.hpp>

namespace google {
namespace protobuf {
class Struct;
}  // namespace protobuf
}  // namespace google

namespace node {
namespace nsolid {
namespace grpc {

nlohmann::json
  protobuf_struct_to_json(const google::protobuf::Struct& proto_struct);

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_GRPC_UTILS_H_
