#include <node.h>
#include <uv.h>
#include <v8.h>
#include <nsolid/nsolid_api.h>

#include <assert.h>
#include <atomic>

using node::nsolid::EnvList;
using CommandType = node::nsolid::CommandType;

using v8::Context;
using v8::FunctionCallbackInfo;
using v8::Local;
using v8::Value;

constexpr CommandType EventLoop = CommandType::EventLoop;

std::atomic<int> init_cntr = { 0 };
std::atomic<int> run_cntr = { 0 };
std::atomic<int> cb_cntr = { 0 };
std::atomic<int> cb_void_cntr = { 0 };
std::atomic<int> cmd_cntr = { 0 };
std::atomic<int> cmd_void_cntr = { 0 };

struct TmpStor {
  TmpStor* self_ptr;
};

static void at_exit(void*) {
  assert(init_cntr == 1);
  assert(run_cntr == cb_cntr);
  assert(run_cntr == cb_void_cntr);
  assert(run_cntr == cmd_cntr);
  assert(run_cntr == cmd_void_cntr);
}

static void cb_fn(TmpStor* ts) {
  uv_thread_t thread_self = uv_thread_self();
  uv_thread_t thread_envlist = EnvList::Inst()->thread();
  cb_cntr++;
  assert(uv_thread_equal(&thread_self, &thread_envlist));
  assert(ts == ts->self_ptr);
  delete ts;
}

static void cmd_fn(node::nsolid::SharedEnvInst envinst_sp, TmpStor* ts) {
  v8::Isolate* isolate = v8::Isolate::TryGetCurrent();
  assert(envinst_sp->isolate() == isolate);
  node::nsolid::QueueCallback(cb_fn, ts);
  cmd_cntr++;
}

static void cb_void_fn() {
  uv_thread_t thread_self = uv_thread_self();
  uv_thread_t thread_envlist = EnvList::Inst()->thread();
  cb_void_cntr++;
  assert(uv_thread_equal(&thread_self, &thread_envlist));
}

static void cmd_void_fn(node::nsolid::SharedEnvInst envinst_sp) {
  v8::Isolate* isolate = v8::Isolate::TryGetCurrent();
  assert(envinst_sp->isolate() == isolate);
  node::nsolid::QueueCallback(cb_void_fn);
  cmd_void_cntr++;
}

static void RunEventLoop(const FunctionCallbackInfo<Value>& args) {
  // Runs the EventLoop command on the given thread_id.
  Local<Context> ctx = args.GetIsolate()->GetCurrentContext();
  uint32_t thread_id = args[0]->Uint32Value(ctx).FromJust();
  auto* ts = new TmpStor();
  ts->self_ptr = ts;
  node::nsolid::SharedEnvInst envinst = node::nsolid::GetEnvInst(thread_id);
  assert(0 == node::nsolid::RunCommand(envinst, EventLoop, cmd_fn, ts));
  assert(0 == node::nsolid::RunCommand(envinst, EventLoop, cmd_void_fn));
  run_cntr++;
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "runEventLoop", RunEventLoop);
  // While NODE_MODULE_INIT will run for every Worker, the first execution
  // won't run in parallel with another. So this won't cause a race condition.
  node::nsolid::SharedEnvInst envinst = node::nsolid::GetLocalEnvInst(context);
  if (node::nsolid::IsMainThread(envinst)) {
    init_cntr++;
    node::AtExit(node::GetCurrentEnvironment(context), at_exit, nullptr);
  }
}
