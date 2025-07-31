#include <node.h>
#include <v8.h>
#include <nsolid.h>

#include <assert.h>

// JS related functions //

static void AgentId(const v8::FunctionCallbackInfo<v8::Value>& args) {
  return args.GetReturnValue().Set(
    v8::String::NewFromUtf8(args.GetIsolate(),
                            node::nsolid::GetAgentId().c_str(),
                            v8::NewStringType::kNormal).ToLocalChecked());
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "agentId", AgentId);
}
