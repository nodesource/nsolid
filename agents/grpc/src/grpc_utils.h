#ifndef AGENTS_GRPC_SRC_GRPC_UTILS_H_
#define AGENTS_GRPC_SRC_GRPC_UTILS_H_

// Pre-declarations
namespace nlohmann {
class json;
}  // namespace nlohmann

namespace google {
namespace protobuf {
class Struct;
class Value;
}  // namespace protobuf
}  // namespace google

namespace node {
namespace nsolid {
namespace grpc {

static void json_to_protobuf_struct(const nlohmann::json&,
                                    google::protobuf::Struct*);

}  // namespace grpc
}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_GRPC_SRC_GRPC_UTILS_H_
