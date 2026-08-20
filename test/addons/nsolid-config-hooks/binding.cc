#include <node.h>
#include <v8.h>
#include <nsolid.h>

#include <assert.h>
#include <memory>
#include <string>

std::atomic<int> config_count = { 0 };

static void did_config(std::string config) {
  config_count++;
}

// JS related functions //

static void CheckConfig(const v8::FunctionCallbackInfo<v8::Value>& args) {
  args.GetReturnValue().Set(config_count.load());
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "checkConfig", CheckConfig);
  // While NODE_MODULE_INIT will run for every Worker, the first execution
  // won't run in parallel with another. So this won't cause a race condition.
  node::nsolid::SharedEnvInst envinst = node::nsolid::GetLocalEnvInst(context);
  if (node::nsolid::IsMainThread(envinst)) {
    node::nsolid::OnConfigurationHook(did_config);
  }
}
