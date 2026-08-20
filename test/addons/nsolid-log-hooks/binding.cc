#include <node.h>
#include <v8.h>
#include <nsolid.h>
#include <nsolid/nsolid_api.h>

#include <assert.h>
#include <atomic>

using node::nsolid::EnvList;

using v8::FunctionCallbackInfo;
using v8::Value;

std::atomic<uint32_t> cntr = { 0 };

// While node::AtExit can run for any Environment, we only have this set to run
// on the Environment of the main thread. So by this point the env_map_size
// should equal 0.
static void at_exit(void*) {
  assert(cntr == 66);
}

static void log_written(node::nsolid::SharedEnvInst,
                        node::nsolid::LogWriteInfo info) {
  cntr++;
}

// JS related functions //

static void WriteLog(const FunctionCallbackInfo<Value>& info) {
  v8::String::Utf8Value s(info.GetIsolate(), info[0]);
  std::string ss = *s;
  EnvList::Inst()->WriteLogLine(node::nsolid::GetLocalEnvInst(
        info.GetIsolate()), { ss, 5, 0, "", "", 0 });
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "writeLog", WriteLog);
  // While NODE_MODULE_INIT will run for every Worker, the first execution
  // won't run in parallel with another. So this won't cause a race condition.
  node::nsolid::SharedEnvInst envinst = node::nsolid::GetLocalEnvInst(context);
  if (node::nsolid::IsMainThread(envinst)) {
    node::AtExit(node::GetCurrentEnvironment(context), at_exit, nullptr);
    node::nsolid::OnLogWriteHook(log_written);
  }
}
