#include "grpc_utils.h"
#include "nlohmann/json.hpp"
#include "google/protobuf/struct.pb.h"

namespace node {
namespace nsolid {
namespace grpc {

static void json_to_protobuf_value(const nlohmann::json& j,
                            google::protobuf::Value* value) {

}

void json_to_protobuf_struct(const nlohmann::json& j,
                             google::protobuf::Struct* proto_struct) {
  for (auto it = j.begin(); it != j.end(); ++it) {
      json_to_protobuf_value(it.value(), &(*proto_struct->mutable_fields())[it.key()]);
  }
}

}  // namespace grpc
}  // namespace nsolid
}  // namespace node
