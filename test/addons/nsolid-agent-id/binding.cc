#include <node.h>
#include <v8.h>
#include <nsolid/nsolid_api.h>

#include <assert.h>

using node::nsolid::EnvInst;
using node::nsolid::EnvList;

// While node::AtExit can run for any Environment, we only have this set to run
// on the Environment of the main thread. So by this point the env_map_size
// should equal 0.
static void at_exit(void*) {
  assert(EnvList::Inst()->env_map_size() == 1);
}

// JS related functions //

static void AgentId(const v8::FunctionCallbackInfo<v8::Value>& args) {
  return args.GetReturnValue().Set(
    v8::String::NewFromUtf8(args.GetIsolate(),
                            EnvList::Inst()->AgentId().c_str(),
                            v8::NewStringType::kNormal).ToLocalChecked());
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "agentId", AgentId);
  // While NODE_MODULE_INIT will run for every Worker, the first execution
  // won't run in parallel with another. So this won't cause a race condition.
  if (EnvInst::GetEnvLocalInst(context->GetIsolate())->thread_id() == 0)
    node::AtExit(node::GetCurrentEnvironment(context), at_exit, nullptr);
}
