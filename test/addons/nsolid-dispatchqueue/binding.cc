#include <node.h>
#include <v8.h>
#include <nsolid/nsolid_api.h>

#include <assert.h>

using node::nsolid::EnvInst;
using node::nsolid::EnvList;
using node::nsolid::DispatchQueue;

struct Foo {
};

DispatchQueue<Foo> global_qd;
Foo foo;

// While node::AtExit can run for any Environment, we only have this set to run
// on the Environment of the main thread. So by this point the env_map_size
// should equal 0.
static void at_exit(void*) {
  assert(EnvList::Inst()->env_map_size() == 1);
}

// JS related functions //

uint64_t last_start_call = uv_hrtime();

static void start_cb(std::queue<Foo>&& q) {
  printf("start_cb: %ld %lu\n", q.size(), uv_hrtime() - last_start_call);
}

static void check_init(int er, DispatchQueue<Foo>* f) {
  printf("check_init: %d\n", er);
  if (er) {
    return;
  }
  er = f->Start(100, 100, start_cb);
  if (er) {
    // Nothing to do.
  }
}

static void RunDispatch(const v8::FunctionCallbackInfo<v8::Value>& args) {
  printf("RunDispatch\n");
  global_qd.Init(check_init);
}

static void EnqueueItem(const v8::FunctionCallbackInfo<v8::Value>& args) {
  printf("EnqueueItem\n");
  global_qd.Enqueue(foo);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "runDispatch", RunDispatch);
  NODE_SET_METHOD(exports, "enqueueItem", EnqueueItem);

  // While NODE_MODULE_INIT will run for every Worker, the first execution
  // won't run in parallel with another. So this won't cause a race condition.
  if (EnvInst::GetEnvLocalInst(context->GetIsolate())->thread_id() != 0)
    return;

  node::AtExit(node::GetCurrentEnvironment(context), at_exit, nullptr);
}
