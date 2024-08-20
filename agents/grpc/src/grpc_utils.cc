#include "grpc_utils.h"
#include "asserts-cpp/asserts.h"
#include "google/protobuf/struct.pb.h"

namespace node {
namespace nsolid {
namespace grpc {

static nlohmann::json protobuf_value_to_json(const google::protobuf::Value& value) {
  nlohmann::json j;
  switch (value.kind_case()) {
    case google::protobuf::Value::kNullValue:
      j = nullptr;
    break;
    case google::protobuf::Value::kBoolValue:
      j = value.bool_value();
    break;
    case google::protobuf::Value::kNumberValue:
      j = value.number_value();
    break;
    case google::protobuf::Value::kStringValue:
      j = value.string_value();
    break;
    case google::protobuf::Value::kListValue:
    {
      nlohmann::json array_json = nlohmann::json::array();
      for (const auto& item : value.list_value().values()) {
        array_json.push_back(protobuf_value_to_json(item));
      }
      j = array_json;
      break;
    }
    case google::protobuf::Value::kStructValue:
    {
      nlohmann::json object_json;
      const auto& fields = value.struct_value().fields();
      for (const auto& field : fields) {
        object_json[field.first] = protobuf_value_to_json(field.second);
      }
      j = object_json;
      break;
    }
    default:
      ASSERT(0);
      break;
  }
  return j;
}

nlohmann::json protobuf_struct_to_json(const google::protobuf::Struct& proto_struct) {
  nlohmann::json j;
  const auto& fields = proto_struct.fields();
  for (const auto& field : fields) {
    j[field.first] = protobuf_value_to_json(field.second);
  }
  return j;
}


}  // namespace grpc
}  // namespace nsolid
}  // namespace node
