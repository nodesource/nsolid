#include <node.h>
#include <v8.h>
#include <nsolid/nsolid_api.h>

#include <assert.h>
#include <atomic>

using node::nsolid::EnvInst;
using node::nsolid::EnvList;

std::atomic<uint32_t> cntr = { 0 };

// While node::AtExit can run for any Environment, we only have this set to run
// on the Environment of the main thread. So by this point the env_map_size
// should equal 0.
static void at_exit(void*) {
  assert(EnvList::Inst()->env_map_size() == 1);
  assert(cntr == 0);
}

static void env_creation(node::nsolid::SharedEnvInst envinst) {
  cntr += node::nsolid::GetThreadId(envinst);
}

static void env_deletion(node::nsolid::SharedEnvInst envinst) {
  cntr -= node::nsolid::GetThreadId(envinst);
}

// JS related functions //

NODE_MODULE_INIT(/* exports, module, context */) {
  // While NODE_MODULE_INIT will run for every Worker, the first execution
  // won't run in parallel with another. So this won't cause a race condition.
  if (EnvInst::GetEnvLocalInst(context->GetIsolate())->thread_id() == 0) {
    node::AtExit(node::GetCurrentEnvironment(context), at_exit, nullptr);
    node::nsolid::ThreadAddedHook(env_creation);
    node::nsolid::ThreadRemovedHook(env_deletion);
  }
}
