#include <node.h>
#include <v8.h>
#include <uv.h>
#include <nsolid.h>

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

static void profile_cb(node::nsolid::SharedEnvInst envinst, int status) {
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
  cb->Call(context, Undefined(isolate), 2, argv);
}

static void got_profile(int status,
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
                                           profile_cb,
                                           status));
    }
  } else {
    it->second.profile += profile;
  }

  uv_mutex_unlock(&profiles_map_lock);
}

static void StartTrackingHeapObjectsBinding(
    const FunctionCallbackInfo<Value>& args) {
  HandleScope handle_scope(args.GetIsolate());
  // thread_id
  assert(args[0]->IsUint32());
  // Redacted heap snapshot
  assert(args[1]->IsBoolean());
  // Track allocations
  assert(args[2]->IsBoolean());
  // Stop after this many milliseconds
  assert(args[3]->IsNumber());
  if (args.Length() > 4) {
    assert(args[4]->IsFunction());
  }

  uint64_t thread_id = args[0].As<Number>()->Value();
  bool redacted = args[1]->BooleanValue(args.GetIsolate());
  bool track_allocations = args[2]->BooleanValue(args.GetIsolate());
  uint64_t duration = static_cast<uint64_t>(
      args[3]->NumberValue(args.GetIsolate()->GetCurrentContext()).FromJust());

  uv_mutex_lock(&profiles_map_lock);
  auto pair = profiles.emplace(thread_id, Stor());
  if (args.Length() > 4) {
    pair.first->second.cb.Reset(args.GetIsolate(), args[4].As<Function>());
  }
  uv_mutex_unlock(&profiles_map_lock);

  int ret = node::nsolid::Snapshot::StartTrackingHeapObjects(
      node::nsolid::GetEnvInst(thread_id),
      redacted,
      track_allocations,
      duration,
      got_profile,
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

static void StopTrackingHeapObjects(const FunctionCallbackInfo<Value>& args) {
  HandleScope handle_scope(args.GetIsolate());
  // thread_id
  assert(args[0]->IsUint32());

  uint64_t thread_id = args[0].As<Number>()->Value();

  int ret = node::nsolid::Snapshot::StopTrackingHeapObjects(
      node::nsolid::GetEnvInst(thread_id));
  args.GetReturnValue().Set(ret);
}

static void StopTrackingHeapObjectsSync(
    const FunctionCallbackInfo<Value>& args) {
  HandleScope handle_scope(args.GetIsolate());
  // thread_id
  assert(args[0]->IsUint32());

  uint64_t thread_id = args[0].As<Number>()->Value();

  int ret = node::nsolid::Snapshot::StopTrackingHeapObjectsSync(
      node::nsolid::GetEnvInst(thread_id));
  args.GetReturnValue().Set(ret);
}

static void at_exit_cb() {
  uv_mutex_destroy(&profiles_map_lock);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(
      exports, "startTrackingHeapObjects", StartTrackingHeapObjectsBinding);
  NODE_SET_METHOD(exports, "stopTrackingHeapObjects", StopTrackingHeapObjects);
  NODE_SET_METHOD(
      exports, "stopTrackingHeapObjectsSync", StopTrackingHeapObjectsSync);
  node::nsolid::SharedEnvInst envinst = node::nsolid::GetLocalEnvInst(context);
  if (node::nsolid::IsMainThread(envinst)) {
    assert(0 == uv_mutex_init(&profiles_map_lock));
    atexit(at_exit_cb);
  }
}
