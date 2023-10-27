#include <nsolid.h>
#include <node.h>
#include <v8.h>

#include <assert.h>
#include <cmath>
#include <map>

using v8::FunctionCallbackInfo;
using v8::Uint32;
using v8::Value;

constexpr uint64_t threshold = 200;
// uint32_t - thread_id
// uint64_t - time that resetTest was called.
static std::map<uint32_t, uint64_t> worker_map;
static uv_mutex_t worker_map_lock;

// While node::AtExit can run for any Environment, we only have this set to run
// on the Environment of the main thread. So by this point the env_map_size
// should equal 1.
static void at_exit(void*) {
  uv_mutex_destroy(&worker_map_lock);
}

static void loop_blocked(node::nsolid::SharedEnvInst envinst,
                         std::string body) {
  uint64_t now = uv_hrtime();
  uint64_t then;
  uint64_t thread_id = node::nsolid::GetThreadId(envinst);

  uv_mutex_lock(&worker_map_lock);
  then = worker_map[thread_id];
  worker_map[thread_id] = now;
  uv_mutex_unlock(&worker_map_lock);

  assert(now > then);
}

static void loop_unblocked(node::nsolid::SharedEnvInst envinst,
                           std::string) {
  uint64_t now = uv_hrtime();
  uint64_t then;
  uint64_t thread_id = node::nsolid::GetThreadId(envinst);

  uv_mutex_lock(&worker_map_lock);
  then = worker_map[thread_id];
  uv_mutex_unlock(&worker_map_lock);

  assert(now > then);
}

// JS related functions //

static void ResetTest(const FunctionCallbackInfo<Value>& args) {
  assert(args[0]->IsUint32());
  uint32_t thread_id = args[0].As<Uint32>()->Value();
  uint64_t now = uv_hrtime();
  uv_mutex_lock(&worker_map_lock);
  worker_map[thread_id] = now;
  uv_mutex_unlock(&worker_map_lock);
}

static void SetHooks(const FunctionCallbackInfo<Value>& args) {
  int er;

  er = node::nsolid::OnBlockedLoopHook(threshold, loop_blocked);
  assert(er == 0);
  er = node::nsolid::OnUnblockedLoopHook(loop_unblocked);
  assert(er == 0);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "resetTest", ResetTest);
  NODE_SET_METHOD(exports, "setHooks", SetHooks);

  uint64_t thread_id = node::nsolid::GetThreadId(
      node::nsolid::GetLocalEnvInst(context));
  assert(UINT64_MAX != thread_id);
  if (thread_id == 0) {
    assert(0 == uv_mutex_init(&worker_map_lock));
    node::AtExit(node::GetCurrentEnvironment(context), at_exit, nullptr);
  }
  uv_mutex_lock(&worker_map_lock);
  worker_map[thread_id] = 0;
  uv_mutex_unlock(&worker_map_lock);
}
