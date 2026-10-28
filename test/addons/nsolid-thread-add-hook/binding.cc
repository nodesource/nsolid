#include <node.h>
#include <v8.h>
#include <nsolid.h>

#include <atomic>

using node::nsolid::ProcessMetrics;
using node::nsolid::ThreadMetrics;

using v8::FunctionCallbackInfo;
using v8::Value;

std::atomic<int32_t> thread_added_cntr = { 0 };
std::atomic<int32_t> thread_removed_cntr = { 0 };

void thread_added(node::nsolid::SharedEnvInst envinst) {
  thread_added_cntr += node::nsolid::GetThreadId(envinst);
}

void thread_removed(node::nsolid::SharedEnvInst envinst) {
  thread_removed_cntr += node::nsolid::GetThreadId(envinst);
}

static void SetThreadHooks(const FunctionCallbackInfo<Value>& args) {
  node::nsolid::ThreadAddedHook(thread_added);
  node::nsolid::ThreadRemovedHook(thread_removed);
}

static void GetThreadAddedCntr(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(thread_added_cntr);
}

static void GetThreadRemovedCntr(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(thread_removed_cntr);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "setThreadHooks", SetThreadHooks);
  NODE_SET_METHOD(exports, "getThreadAddedCntr", GetThreadAddedCntr);
  NODE_SET_METHOD(exports, "getThreadRemovedCntr", GetThreadRemovedCntr);
}
