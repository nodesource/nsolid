#include "node_internals.h"
#include "node_external_reference.h"
#include "grpc_agent.h"
#include "util.h"
#include "asserts-cpp/asserts.h"

using nlohmann::json;
using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::JSON;
using v8::Local;
using v8::NewStringType;
using v8::Number;
using v8::Object;
using v8::String;
using v8::Uint32;
using v8::Value;

namespace node {
namespace nsolid {
namespace grpc {

static void Status(const FunctionCallbackInfo<Value>& args) {
  // args.GetReturnValue().Set(
  //   String::NewFromUtf8(args.GetIsolate(),
  //                       ZmqAgent::Inst()->status().c_str(),
  //                       NewStringType::kNormal).ToLocalChecked());
}

static void Snapshot(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  uint64_t thread_id = ThreadId(context);

  grpcagent::CommandRequest req;
  req.set_command("snapshot");
  auto* command_args = req.mutable_args();
  auto* snapshot_args = command_args->mutable_profile();
  snapshot_args->set_thread_id(thread_id);
  auto* metadata = snapshot_args->mutable_metadata();
  auto* fields = metadata->mutable_fields();
  (*fields)["reason"].set_string_value("Agent API");
  args.GetReturnValue().Set(GrpcAgent::Inst()->start_heap_snapshot_from_js(req));
}

static void StartCPUProfile(const FunctionCallbackInfo<Value>& args) {
  ASSERT_EQ(1, args.Length());
  ASSERT(args[0]->IsNumber());
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  uint64_t thread_id = ThreadId(context);
  uint64_t timeout = args[0].As<Number>()->Value();

  grpcagent::CommandRequest req;
  req.set_command("profile");
  auto* command_args = req.mutable_args();
  auto* profile_args = command_args->mutable_profile(); 
  profile_args->set_thread_id(thread_id);
  profile_args->set_duration(timeout);
  auto* metadata = profile_args->mutable_metadata();
  auto* fields = metadata->mutable_fields();
  (*fields)["reason"].set_string_value("Agent API");
  args.GetReturnValue().Set(GrpcAgent::Inst()->start_cpu_profile_from_js(req));
}

static void EndCPUProfile(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(
    CpuProfiler::StopProfileSync(GetLocalEnvInst(args.GetIsolate())));
}

static void StartHeapProfile(const FunctionCallbackInfo<Value>& args) {
  ASSERT_EQ(2 , args.Length());
  ASSERT(args[0]->IsNumber());
  ASSERT(args[1]->IsBoolean());
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  uint64_t thread_id = ThreadId(context);
  uint64_t timeout = args[0].As<Number>()->Value();
  bool track_allocations = args[1]->BooleanValue(isolate);

  fprintf(stderr, "StartHeapProfile: %ld, %ld, %d\n", thread_id, timeout, track_allocations);

  grpcagent::CommandRequest req;
  req.set_command("heap_profile");
  auto* command_args = req.mutable_args();
  auto* profile_args = command_args->mutable_profile(); 
  profile_args->set_thread_id(thread_id);
  profile_args->set_duration(timeout);
  auto* metadata = profile_args->mutable_metadata();
  auto* fields = metadata->mutable_fields();
  (*fields)["reason"].set_string_value("Agent API");
  auto* heap_profile = profile_args->mutable_heap_profile();
  heap_profile->set_track_allocations(track_allocations);
  args.GetReturnValue().Set(GrpcAgent::Inst()->start_heap_profile_from_js(req));
}

static void EndHeapProfile(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(
    Snapshot::StopTrackingHeapObjectsSync(GetLocalEnvInst(args.GetIsolate())));
}

static void StartHeapSampling(const FunctionCallbackInfo<Value>& args) {
  ASSERT_EQ(4, args.Length());
  ASSERT(args[0]->IsNumber());
  ASSERT(args[1]->IsUint32());
  ASSERT(args[2]->IsUint32());
  ASSERT(args[3]->IsNumber());
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  uint64_t thread_id = ThreadId(context);
  uint64_t sample_interval = args[0].As<Number>()->Value();
  uint32_t stack_depth = args[1].As<Uint32>()->Value();
  uint32_t flags = args[2].As<Uint32>()->Value();
  uint64_t duration = args[3].As<Number>()->Value();

  grpcagent::CommandRequest req;
  req.set_command("heap_sampling");
  auto* command_args = req.mutable_args();
  auto* profile_args = command_args->mutable_profile();
  profile_args->set_thread_id(thread_id);
  profile_args->set_duration(duration);
  auto* metadata = profile_args->mutable_metadata();
  auto* fields = metadata->mutable_fields();
  (*fields)["reason"].set_string_value("Agent API");
  auto* heap_sampling = profile_args->mutable_heap_sampling();
  heap_sampling->set_sample_interval(sample_interval);
  heap_sampling->set_stack_depth(stack_depth);
  heap_sampling->set_flags(flags);
  args.GetReturnValue().Set(GrpcAgent::Inst()->start_heap_sampling_from_js(req));
}

static void EndHeapSampling(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(
    Snapshot::StopSamplingSync(GetLocalEnvInst(args.GetIsolate())));
}

static void Start(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(GrpcAgent::Inst()->start());
}

static void RegisterExternalReferences(ExternalReferenceRegistry* registry) {
  registry->Register(Status);
  registry->Register(Snapshot);
  registry->Register(StartCPUProfile);
  registry->Register(EndCPUProfile);
  registry->Register(StartHeapProfile);
  registry->Register(EndHeapProfile);
  registry->Register(StartHeapSampling);
  registry->Register(EndHeapSampling);
  registry->Register(Start);
}

void InitGrpcAgent(Local<Object> exports,
                  Local<Value> unused,
                  Local<Context> context,
                  void* priv) {
  NODE_SET_METHOD(exports, "status", Status);
  NODE_SET_METHOD(exports, "snapshot", Snapshot);
  NODE_SET_METHOD(exports, "profile", StartCPUProfile);
  NODE_SET_METHOD(exports, "profileEnd", EndCPUProfile);
  NODE_SET_METHOD(exports, "heapProfile", StartHeapProfile);
  NODE_SET_METHOD(exports, "heapProfileEnd", EndHeapProfile);
  NODE_SET_METHOD(exports, "heapSampling", StartHeapSampling);
  NODE_SET_METHOD(exports, "heapSamplingEnd", EndHeapSampling);
  if (!node::nsolid::IsMainThread(node::nsolid::GetLocalEnvInst(context))) {
    return;
  }

  NODE_SET_METHOD(exports, "start", Start);
}

}  // namespace zmq
}  // namespace nsolid
}  // namespace node

NODE_BINDING_CONTEXT_AWARE_INTERNAL(nsolid_grpc_agent,
                                    node::nsolid::grpc::InitGrpcAgent)
NODE_BINDING_EXTERNAL_REFERENCE(nsolid_grpc_agent,
                                node::nsolid::grpc::RegisterExternalReferences)
