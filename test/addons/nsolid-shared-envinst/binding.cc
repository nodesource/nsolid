#include <nsolid.h>
#include <v8.h>

#include <assert.h>

using node::nsolid::SharedEnvInst;
using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Uint32;
using v8::Value;

// JS related functions //

static void GetEnvInst(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  assert(args[0]->IsUint32());
  uint32_t thread_id = args[0].As<Uint32>()->Value();
  SharedEnvInst curr_envinst = node::nsolid::GetLocalEnvInst(isolate);
  assert(curr_envinst);
  uint32_t curr_thread_id = node::nsolid::GetThreadId(curr_envinst);
  SharedEnvInst envinst = node::nsolid::GetEnvInst(thread_id);
  if (thread_id == curr_thread_id) {
    assert(envinst == curr_envinst);
    assert(node::nsolid::IsEnvInstCreationThread(envinst) == true);
  } else {
    assert(envinst != curr_envinst);
    assert(node::nsolid::IsEnvInstCreationThread(envinst) == false);
  }

  bool ret = envinst != nullptr;
  args.GetReturnValue().Set(ret);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "getEnvInst", GetEnvInst);
}
