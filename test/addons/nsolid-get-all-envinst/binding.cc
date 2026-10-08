#include <node.h>
#include <v8.h>
#include <uv.h>
#include <nsolid.h>

#include <assert.h>
#include <atomic>

using v8::FunctionCallbackInfo;
using v8::Value;

void CheckEnvCount(const FunctionCallbackInfo<Value>& args) {
  int len = 0;
  node::nsolid::GetAllEnvInst([&len](node::nsolid::SharedEnvInst) {
    len++;
  });
  args.GetReturnValue().Set(len);
}


NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "checkEnvCount", CheckEnvCount);
}
