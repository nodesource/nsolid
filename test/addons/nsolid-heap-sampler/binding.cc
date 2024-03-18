#include <node.h>
#include <v8.h>
#include <uv.h>
#include <nsolid.h>
#include <v8-profiler.h>

#include <assert.h>
#include <map>

using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::Global;
using v8::HandleScope;
using v8::Integer;
using v8::Isolate;
using v8::Local;
using v8::NewStringType;
using v8::Number;
using v8::String;
using v8::Value;

struct Stor {
  std::string profile;
  Global<Function> cb;
};

std::map<uint64_t, Stor> profiles;
uv_mutex_t profiles_map_lock;

static void sample_cb(node::nsolid::SharedEnvInst envinst, int status) {
  uint64_t thread_id = node::nsolid::GetThreadId(envinst);
  uv_mutex_lock(&profiles_map_lock);
  auto it = profiles.find(thread_id);
  assert(it != profiles.end());
  Isolate* isolate = Isolate::GetCurrent();
  HandleScope scope(isolate);
  Local<Context> context = isolate->GetCurrentContext();
  Context::Scope context_scope(context);
  Local<Function> cb = it->second.cb.Get(isolate);
  Local<Value> argv[] = {
    Integer::New(isolate, status),
    String::NewFromUtf8(
      isolate,
      it->second.profile.c_str(),
      NewStringType::kNormal).ToLocalChecked()
  };

  profiles.erase(it);
  uv_mutex_unlock(&profiles_map_lock);
  v8::MaybeLocal<Value> ret = cb->Call(context, Undefined(isolate), 2, argv);
  assert(!ret.IsEmpty());
}

static void got_sampled(int status,
                        std::string profile,
                        uint64_t thread_id) {
  assert(status == 0);
  uv_mutex_lock(&profiles_map_lock);
  auto it = profiles.find(thread_id);
  assert(it != profiles.end());
  if (profile.empty()) {
    if (it->second.cb.IsEmpty()) {
      profiles.erase(it);
    } else {
      node::nsolid::SharedEnvInst envinst = node::nsolid::GetEnvInst(thread_id);
      assert(0 == node::nsolid::RunCommand(envinst,
                                           node::nsolid::CommandType::EventLoop,
                                           sample_cb,
                                           status));
    }
  } else {
    it->second.profile += profile;
  }
  uv_mutex_unlock(&profiles_map_lock);
}

static void at_exit_cb() {
  uv_mutex_destroy(&profiles_map_lock);
}


static void StartHeapSampler(
    const FunctionCallbackInfo<Value>& args) {
  v8::HandleScope handle_scope(args.GetIsolate());
  // thread_id
  assert(args[0]->IsUint32());
  // Stop after this many milliseconds
  assert(args[1]->IsNumber());

  uint64_t thread_id = args[0].As<Number>()->Value();
  uint64_t duration = static_cast<uint64_t>(
      args[1]->NumberValue(args.GetIsolate()->GetCurrentContext()).FromJust());

  uv_mutex_lock(&profiles_map_lock);
  auto pair = profiles.emplace(thread_id, Stor());
  if (args.Length() > 2) {
    pair.first->second.cb.Reset(args.GetIsolate(), args[2].As<Function>());
  }
  uv_mutex_unlock(&profiles_map_lock);
  int ret = node::nsolid::Snapshot::StartSampling(
      node::nsolid::GetEnvInst(thread_id),
      duration,
      got_sampled,
      thread_id);
  if (ret != 0) {
    if (pair.second) {
      uv_mutex_lock(&profiles_map_lock);
      profiles.erase(thread_id);
      uv_mutex_unlock(&profiles_map_lock);
    }
  } else {
    assert(pair.second);
  }
  args.GetReturnValue().Set(Integer::New(args.GetIsolate(), ret));
}

static void StopHeapSampler(const FunctionCallbackInfo<Value>& args) {
  v8::HandleScope handle_scope(args.GetIsolate());
  // thread_id
  assert(args[0]->IsUint32());

  uint64_t thread_id = args[0].As<Number>()->Value();

  int ret = node::nsolid::Snapshot::StopSampling(
      node::nsolid::GetEnvInst(thread_id));
  args.GetReturnValue().Set(Integer::New(args.GetIsolate(), ret));
}

static void StopHeapSamplerSync(const FunctionCallbackInfo<Value>& args) {
  v8::HandleScope handle_scope(args.GetIsolate());
  // thread_id
  assert(args[0]->IsUint32());

  uint64_t thread_id = args[0].As<Number>()->Value();

  int ret = node::nsolid::Snapshot::StopSamplingSync(
      node::nsolid::GetEnvInst(thread_id));
  args.GetReturnValue().Set(Integer::New(args.GetIsolate(), ret));
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(
      exports, "startSampling", StartHeapSampler);
  NODE_SET_METHOD(exports, "stopSampling", StopHeapSampler);
  NODE_SET_METHOD(exports, "stopSamplingSync", StopHeapSamplerSync);
  node::nsolid::SharedEnvInst envinst = node::nsolid::GetLocalEnvInst(context);
  if (node::nsolid::IsMainThread(envinst)) {
    assert(0 == uv_mutex_init(&profiles_map_lock));
    atexit(at_exit_cb);
  }
}
