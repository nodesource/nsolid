#include "node_internals.h"
#include "node_external_reference.h"
#include "zmq_agent.h"
#include "util.h"

using nlohmann::json;
using v8::Context;
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
namespace zmq {

void at_exit(bool on_signal, bool profile_stopped, ZmqAgent* zmq) {
  zmq->stop(profile_stopped);
}

void Config(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  Local<Object> obj = args[0].As<Object>();
  Local<String> stringify = JSON::Stringify(context, obj).ToLocalChecked();
  String::Utf8Value cfg(isolate, stringify);
  ZmqAgent::config_agent_cb(*cfg, ZmqAgent::Inst());
}

static void Status(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(
    String::NewFromUtf8(args.GetIsolate(),
                        ZmqAgent::Inst()->status().c_str(),
                        NewStringType::kNormal).ToLocalChecked());
}

static void Snapshot(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  uint64_t thread_id = ThreadId(context);
  json message = {
    { "args", {
      { "metadata", {
        { "reason", "Agent API" }
      }},
      { "threadId", thread_id }
    }}
  };

  args.GetReturnValue().Set(ZmqAgent::Inst()->generate_snapshot(message));
}

static void StartCPUProfile(const FunctionCallbackInfo<Value>& args) {
  ASSERT_EQ(1 , args.Length());
  ASSERT(args[0]->IsNumber());
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  uint64_t thread_id = ThreadId(context);
  uint64_t timeout = args[0].As<Number>()->Value();
  json message = {
    { "args", {
      { "metadata", {
        { "reason", "Agent API" }
      }},
      { "duration", timeout },
      { "threadId", thread_id }
    }}
  };

  args.GetReturnValue().Set(ZmqAgent::Inst()->start_profiling(message));
}

static void EndCPUProfile(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  uint64_t thread_id = ThreadId(context);
  args.GetReturnValue().Set(ZmqAgent::Inst()->stop_profiling(thread_id));
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
  json message = {
    { "args", {
      { "metadata", {
        { "reason", "Agent API" }
      }},
      { "duration", timeout },
      { "threadId", thread_id },
      { "trackAllocations", track_allocations }
    }}
  };

  args.GetReturnValue().Set(ZmqAgent::Inst()->start_heap_profiling(message));
}

static void EndHeapProfile(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  uint64_t thread_id = ThreadId(context);
  args.GetReturnValue().Set(ZmqAgent::Inst()->stop_heap_profiling(thread_id));
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
  json message = {
    { "args", {
      { "metadata", {
        { "reason", "Agent API" }
      }},
      { "duration", duration },
      { "sampleInterval", sample_interval },
      { "stackDepth", stack_depth },
      { "flags", flags },
      { "duration", duration },
      { "threadId", thread_id }
    }}
  };

  args.GetReturnValue().Set(ZmqAgent::Inst()->start_heap_sampling(message));
}

static void EndHeapSampling(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  uint64_t thread_id = ThreadId(context);
  args.GetReturnValue().Set(ZmqAgent::Inst()->stop_heap_sampling(thread_id));
}

static void Start(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(ZmqAgent::Inst()->start());
}

static void Stop(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(ZmqAgent::Inst()->stop(false));
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
  registry->Register(Config);
  registry->Register(Start);
  registry->Register(Stop);
}

void InitZmqAgent(Local<Object> exports,
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

  NODE_SET_METHOD(exports, "config", Config);
  NODE_SET_METHOD(exports, "start", Start);
  NODE_SET_METHOD(exports, "stop", Stop);
  AtExitHook(at_exit, ZmqAgent::Inst());
}

}  // namespace zmq
}  // namespace nsolid
}  // namespace node

NODE_BINDING_CONTEXT_AWARE_INTERNAL(nsolid_zmq_agent,
                                    node::nsolid::zmq::InitZmqAgent)
NODE_BINDING_EXTERNAL_REFERENCE(nsolid_zmq_agent,
                                node::nsolid::zmq::RegisterExternalReferences)
