#include <nsolid.h>
#include <node.h>
#include <v8.h>

#include <assert.h>

using v8::FunctionCallbackInfo;
using v8::String;
using v8::Uint32;
using v8::Value;

// JS related functions //

static void GetProcessInfo(const FunctionCallbackInfo<Value>& args) {
  std::string info = node::nsolid::GetProcessInfo();
  return args.GetReturnValue().Set(
    String::NewFromUtf8(args.GetIsolate(),
                        info.c_str(),
                        v8::NewStringType::kNormal).ToLocalChecked());
}

static void GetModuleInfo(const FunctionCallbackInfo<Value>& args) {
  assert(args[0]->IsUint32());

  uint64_t thread_id = args[0].As<v8::Uint32>()->Value();
  std::string info;

  assert(0 == node::nsolid::ModuleInfo(node::nsolid::GetEnvInst(thread_id),
                                       &info));
  return args.GetReturnValue().Set(
    String::NewFromUtf8(args.GetIsolate(),
                        info.c_str(),
                        v8::NewStringType::kNormal).ToLocalChecked());
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "getProcessInfo", GetProcessInfo);
  NODE_SET_METHOD(exports, "getModuleInfo", GetModuleInfo);
}
