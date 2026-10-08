#include <node.h>
#include <v8.h>
#include <uv.h>
#include <nsolid.h>

#include <assert.h>
#include <atomic>

using v8::FunctionCallbackInfo;
using v8::Value;

std::atomic<uint32_t> on_thread_add_cntr = { 0 };
std::atomic<uint32_t> on_thread_remove_cntr = { 0 };


void on_thread_add(node::nsolid::SharedEnvInst, uint64_t) {
  on_thread_add_cntr++;
}

void on_thread_remove(node::nsolid::SharedEnvInst, uint64_t) {
  on_thread_remove_cntr++;
}

// Can't set the add/remove hooks in INIT b/c of licensing.
void SetAddHooks(const FunctionCallbackInfo<Value>& args) {
  uint64_t ptid;
  int er;

  ptid = node::nsolid::GetThreadId(
      node::nsolid::GetLocalEnvInst(args.GetIsolate()->GetCurrentContext()));
  assert(UINT64_MAX != ptid);
  er = node::nsolid::ThreadAddedHook(on_thread_add, ptid);
  assert(er == 0);
  er = node::nsolid::ThreadRemovedHook(on_thread_remove, ptid);
  assert(er == 0);
}

void GetOnThreadAdd(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(on_thread_add_cntr);
}

void GetOnThreadRemove(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(on_thread_remove_cntr);
}


NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "setAddHooks", SetAddHooks);
  NODE_SET_METHOD(exports, "getOnThreadAdd", GetOnThreadAdd);
  NODE_SET_METHOD(exports, "getOnThreadRemove", GetOnThreadRemove);
}
