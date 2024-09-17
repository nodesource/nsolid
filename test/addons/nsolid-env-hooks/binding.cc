#include <node.h>
#include <v8.h>
#include <nsolid.h>

#include <assert.h>
#include <atomic>

std::atomic<uint32_t> cntr = { 0 };

// While node::AtExit can run for any Environment, we only have this set to run
// on the Environment of the main thread. So by this point the env_map_size
// should equal 0.
static void at_exit(void*) {
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
  node::nsolid::SharedEnvInst envinst = node::nsolid::GetLocalEnvInst(context);
  if (node::nsolid::IsMainThread(envinst)) {
    node::AtExit(node::GetCurrentEnvironment(context), at_exit, nullptr);
    node::nsolid::ThreadAddedHook(env_creation);
    node::nsolid::ThreadRemovedHook(env_deletion);
  }
}
