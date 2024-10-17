~/software/protobuf/src/protoc \
  --cpp_out=./agents/grpc/src/proto/ \
  --grpc-cpp_out=./agents/grpc/src/proto/ \
  --plugin="protoc-gen-grpc-cpp=./out/Release/grpc_cpp_plugin" \
  --proto_path=agents/grpc/proto/ \
  --proto_path=deps/protobuf/src/ \
  --proto_path=deps/opentelemetry-cpp/third_party/opentelemetry-proto/ \
  agents/grpc/proto/*.proto