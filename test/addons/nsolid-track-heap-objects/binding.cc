#include <node.h>
#include <v8.h>
#include <uv.h>
#include <nsolid.h>

#include <assert.h>
#include <map>

using v8::FunctionCallbackInfo;
using v8::Integer;
using v8::Number;
using v8::Value;

std::map<uint64_t, std::string> snapshots;

static void got_snapshot(int status,
                         std::string snapshot,
                         uint64_t thread_id) {
  assert(status == 0);
  snapshots[thread_id] += snapshot;
}

static void started_profiler(int status, std::string json, uint64_t thread_id) {
  assert(status == 0);
}

static void StartTrackingHeapObjectsBinding(
    const FunctionCallbackInfo<Value>& args) {
  v8::HandleScope handle_scope(args.GetIsolate());
  // thread_id
  assert(args[0]->IsUint32());
  // Redacted heap snapshot
  assert(args[1]->IsBoolean());
  // Track allocations
  assert(args[2]->IsBoolean());
  // Stop after this many milliseconds
  assert(args[3]->IsNumber());

  uint64_t thread_id = args[0].As<Number>()->Value();
  bool redacted = args[1]->BooleanValue(args.GetIsolate());
  bool track_allocations = args[2]->BooleanValue(args.GetIsolate());
  uint64_t duration = static_cast<uint64_t>(
      args[3]->NumberValue(args.GetIsolate()->GetCurrentContext()).FromJust());

  int ret = node::nsolid::Snapshot::StartTrackingHeapObjects(
      node::nsolid::GetEnvInst(thread_id),
      redacted,
      track_allocations,
      duration,
      started_profiler,
      thread_id);
  args.GetReturnValue().Set(Integer::New(args.GetIsolate(), ret));
}

static void StopTrackingHeapObjects(const FunctionCallbackInfo<Value>& args) {
  v8::HandleScope handle_scope(args.GetIsolate());
  // thread_id
  assert(args[0]->IsUint32());

  uint64_t thread_id = args[0].As<Number>()->Value();

  int ret = node::nsolid::Snapshot::StopTrackingHeapObjects(
      node::nsolid::GetEnvInst(thread_id));
  args.GetReturnValue().Set(Integer::New(args.GetIsolate(), ret));
}

static void at_exit_cb() {
  for (const auto& pair : snapshots) {
    assert(pair.second.size() > 0);
  }
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(
      exports, "startTrackingHeapObjects", StartTrackingHeapObjectsBinding);
  NODE_SET_METHOD(exports, "stopTrackingHeapObjects", StopTrackingHeapObjects);
  node::nsolid::SharedEnvInst envinst = node::nsolid::GetLocalEnvInst(context);
  if (node::nsolid::IsMainThread(envinst)) {
    atexit(at_exit_cb);
  }
}
