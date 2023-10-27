#include <nsolid.h>
#include <node.h>
#include <v8.h>

#include <assert.h>

// JS related functions //

static void GetModuleInfo(const v8::FunctionCallbackInfo<v8::Value>& args) {
  assert(args[0]->IsNumber());

  uint64_t thread_id = args[0].As<v8::Uint32>()->Value();
  std::string info;

  int er = node::nsolid::ModuleInfo(node::nsolid::GetEnvInst(thread_id), &info);
  assert(er == 0);

  return args.GetReturnValue().Set(
    v8::String::NewFromUtf8(args.GetIsolate(),
                            info.c_str(),
                            v8::NewStringType::kNormal).ToLocalChecked());
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "getModuleInfo", GetModuleInfo);
}
