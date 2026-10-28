#include "../../../deps/nsuv/include/nsuv-inl.h"

#include <node.h>
#include <v8.h>
#include <nsolid.h>

#include <assert.h>
#include <atomic>

using node::nsolid::CpuProfiler;

using v8::FunctionCallbackInfo;
using v8::String;
using v8::Value;

nsuv::ns_mutex profiles_lock;
std::string last_profile = { "" };  // NOLINT


static void profiler_cb(int status, std::string json, uint64_t thread_id) {
  assert(status == 0);

  nsuv::ns_mutex::scoped_lock lock(profiles_lock);
  last_profile += json;
}


static void StartCpuProfiler(const FunctionCallbackInfo<Value>& args) {
  assert(args[0]->IsNumber());
  assert(args[1]->IsNumber());

  uint64_t thread_id = args[0].As<v8::Uint32>()->Value();
  uint64_t duration = args[1].As<v8::Uint32>()->Value();

  int er = CpuProfiler::TakeProfile(
      node::nsolid::GetEnvInst(thread_id), duration, profiler_cb, thread_id);
  args.GetReturnValue().Set(er);
}


static void StopCpuProfiler(const FunctionCallbackInfo<Value>& args) {
  assert(args[0]->IsNumber());

  uint64_t thread_id = args[0].As<v8::Uint32>()->Value();

  int er = CpuProfiler::StopProfile(node::nsolid::GetEnvInst(thread_id));

  args.GetReturnValue().Set(er);
}


static void GetLastProfile(const FunctionCallbackInfo<Value>& args) {
  std::string p;

  {
    nsuv::ns_mutex::scoped_lock lock(profiles_lock);
    p = last_profile;
    last_profile = "";
  }

  args.GetReturnValue().Set(String::NewFromUtf8(
        args.GetIsolate(),
        p.c_str(),
        v8::NewStringType::kNormal).ToLocalChecked());
}


NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "startCpuProfiler", StartCpuProfiler);
  NODE_SET_METHOD(exports, "stopCpuProfiler", StopCpuProfiler);
  NODE_SET_METHOD(exports, "getLastProfile", GetLastProfile);

  uint64_t thread_id = node::nsolid::GetThreadId(
      node::nsolid::GetLocalEnvInst(context));
  assert(UINT64_MAX != thread_id);
  if (thread_id == 0) {
    int er = profiles_lock.init(true);
    assert(er == 0);
  }
}
