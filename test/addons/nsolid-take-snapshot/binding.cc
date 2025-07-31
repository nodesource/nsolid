#include <node.h>
#include <v8.h>
#include <uv.h>
#include <nsolid.h>

#include <assert.h>
#include <map>

using v8::FunctionCallbackInfo;
using v8::Uint32;
using v8::Value;

std::map<uint64_t, std::string> snapshots;

static void got_snapshot(int status,
                         std::string snapshot,
                         uint64_t thread_id) {
  assert(status == 0);
  snapshots[thread_id] += snapshot;
}

static void GetSnapshot(const FunctionCallbackInfo<Value>& args) {
  assert(args[0]->IsUint32());

  uint64_t thread_id = args[0].As<Uint32>()->Value();

  node::nsolid::Snapshot::TakeSnapshot(
    node::nsolid::GetEnvInst(thread_id), true, got_snapshot, thread_id);
}

static void at_exit_cb() {
  for (const auto& pair : snapshots) {
    assert(pair.second.size() > 0);
  }
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "getSnapshot", GetSnapshot);
  node::nsolid::SharedEnvInst envinst = node::nsolid::GetLocalEnvInst(context);
  if (node::nsolid::IsMainThread(envinst)) {
    atexit(at_exit_cb);
  }
}
