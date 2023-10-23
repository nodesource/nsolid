#include <node.h>
#include <v8.h>
#include <uv.h>
#include <nsolid.h>

#include <assert.h>
#include <atomic>

using v8::FunctionCallbackInfo;
using v8::Uint32;
using v8::Value;

static void got_snapshot(int status,
                         std::string snapshot,
                         uint64_t thread_id) {
  assert(status == 0);
}

static void GetSnapshot(const FunctionCallbackInfo<Value>& args) {
  assert(args[0]->IsUint32());

  uint64_t thread_id = args[0].As<Uint32>()->Value();

  node::nsolid::Snapshot::TakeSnapshot(
    node::nsolid::GetEnvInst(thread_id), true, got_snapshot, thread_id);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "getSnapshot", GetSnapshot);
}
