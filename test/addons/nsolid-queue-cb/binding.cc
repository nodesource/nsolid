#include <node.h>
#include <uv.h>
#include <v8.h>
#include <nsolid/nsolid_api.h>

#include <assert.h>
#include <atomic>

using node::nsolid::EnvInst;
using node::nsolid::EnvList;

using v8::FunctionCallbackInfo;
using v8::Value;

std::atomic<int> init_cntr = { 0 };
std::atomic<int> run_cntr = { 0 };
std::atomic<int> cb_fn2_0_cntr = { 0 };
std::atomic<int> cb_fn2_1_cntr = { 0 };
std::atomic<int> cb_fn2_2_cntr = { 0 };
std::atomic<int> cb_fn2_3_cntr = { 0 };
std::atomic<int> cb_fn3_0_cntr = { 0 };
std::atomic<int> cb_fn3_1_cntr = { 0 };

static void at_exit(void*) {
  assert(EnvList::Inst()->env_map_size() == 1);
  assert(init_cntr == 1);
  assert(run_cntr == cb_fn2_0_cntr);
  assert(run_cntr == cb_fn2_1_cntr);
  assert(run_cntr == cb_fn2_2_cntr);
  assert(run_cntr == cb_fn2_3_cntr);
  assert(run_cntr == cb_fn3_0_cntr);
  assert(run_cntr == cb_fn3_1_cntr);
}
static void cb_fn2() { cb_fn2_0_cntr++; }
static void cb_fn2_1(int i) {
  assert(40 == i);
  cb_fn2_1_cntr++;
}
static void cb_fn2_2(EnvList*, int i) {
  assert(41 == i);
  cb_fn2_2_cntr++;
}
static void cb_fn2_3(EnvList*, EnvList*, int i) {
  assert(42 == i);
  cb_fn2_3_cntr++;
}
static void cb_fn3() { cb_fn3_0_cntr++; }
static void cb_fn3_1(EnvList*) { cb_fn3_1_cntr++; }

// JS related functions //

void QueueCb(const FunctionCallbackInfo<Value>& args) {
  EnvList* envlist = EnvList::Inst();
  uint64_t timeout = 100;
  run_cntr++;
  assert(0 == node::nsolid::QueueCallback(cb_fn2));
  assert(0 == node::nsolid::QueueCallback(cb_fn2_1, 40));
  assert(0 == node::nsolid::QueueCallback(cb_fn2_2, envlist, 41));
  assert(0 == node::nsolid::QueueCallback(cb_fn2_3, envlist, envlist, 42));
  assert(0 == node::nsolid::QueueCallback(timeout, cb_fn3));
  assert(0 == node::nsolid::QueueCallback(timeout, cb_fn3_1, envlist));
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "queueCallback", QueueCb);
  // While NODE_MODULE_INIT will run for every Worker, the first execution
  // won't run in parallel with another. So this won't cause a race condition.
  if (EnvInst::GetCurrent(context)->thread_id() == 0) {
    init_cntr++;
    node::AtExit(node::GetCurrentEnvironment(context), at_exit, nullptr);
  }
}
