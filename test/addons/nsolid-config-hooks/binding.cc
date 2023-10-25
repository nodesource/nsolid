#include <node.h>
#include <v8.h>
#include <nsolid/nsolid_api.h>

#include <assert.h>
#include <memory>
#include <string>

using node::nsolid::EnvInst;
using node::nsolid::EnvList;

std::atomic<int> config_count = { 0 };

// While node::AtExit can run for any Environment, we only have this set to run
// on the Environment of the main thread. So by this point the env_map_size
// should equal 0.
static void at_exit(void*) {
  assert(EnvList::Inst()->env_map_size() == 1);
}

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
  if (EnvInst::GetEnvLocalInst(context->GetIsolate())->thread_id() == 0) {
    node::AtExit(node::GetCurrentEnvironment(context), at_exit, nullptr);
    node::nsolid::OnConfigurationHook(did_config);
  }
}
