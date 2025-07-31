#include <node.h>
#include <uv.h>
#include <v8.h>
#include <nsolid.h>

#include <assert.h>
#include <atomic>

using v8::FunctionCallbackInfo;
using v8::Value;

struct Foo {
  int i;
};

Foo foo;

std::atomic<int> init_cntr = { 0 };
std::atomic<int> run_cntr = { 0 };
std::atomic<int> cb_fn2_0_cntr = { 0 };
std::atomic<int> cb_fn2_1_cntr = { 0 };
std::atomic<int> cb_fn2_2_cntr = { 0 };
std::atomic<int> cb_fn2_3_cntr = { 0 };
std::atomic<int> cb_fn3_0_cntr = { 0 };
std::atomic<int> cb_fn3_1_cntr = { 0 };

static void at_exit(void*) {
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
static void cb_fn2_2(Foo* f, int i) {
  assert(f == &foo);
  assert(41 == i);
  cb_fn2_2_cntr++;
}
static void cb_fn2_3(Foo* f1, Foo* f2, int i) {
  assert(f1 == &foo);
  assert(f2 == &foo);
  assert(42 == i);
  cb_fn2_3_cntr++;
}
static void cb_fn3() { cb_fn3_0_cntr++; }
static void cb_fn3_1(Foo* f) { cb_fn3_1_cntr++; }

// JS related functions //

void QueueCb(const FunctionCallbackInfo<Value>& args) {
  uint64_t timeout = 100;
  run_cntr++;
  assert(0 == node::nsolid::QueueCallback(cb_fn2));
  assert(0 == node::nsolid::QueueCallback(cb_fn2_1, 40));
  assert(0 == node::nsolid::QueueCallback(cb_fn2_2, &foo, 41));
  assert(0 == node::nsolid::QueueCallback(cb_fn2_3, &foo, &foo, 42));
  assert(0 == node::nsolid::QueueCallback(timeout, cb_fn3));
  assert(0 == node::nsolid::QueueCallback(timeout, cb_fn3_1, &foo));
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "queueCallback", QueueCb);
  // While NODE_MODULE_INIT will run for every Worker, the first execution
  // won't run in parallel with another. So this won't cause a race condition.
  node::nsolid::SharedEnvInst envinst = node::nsolid::GetLocalEnvInst(context);
  if (node::nsolid::IsMainThread(envinst)) {
    init_cntr++;
    node::AtExit(node::GetCurrentEnvironment(context), at_exit, nullptr);
  }
}
