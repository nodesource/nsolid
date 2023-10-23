#include <node.h>
#include <v8.h>
#include <nsolid.h>
#include <nsolid/nsolid_api.h>

#include <assert.h>

using node::nsolid::EnvInst;
using node::nsolid::EnvList;

node::nsolid::ProcessMetrics proc_metrics_;
node::nsolid::ProcessMetrics::MetricsStor proc_stor;

static void at_exit(void*) {
  assert(EnvList::Inst()->env_map_size() == 1);
}

static void GetMetrics(const v8::FunctionCallbackInfo<v8::Value>& args) {
  assert(0 == proc_metrics_.Update());
  proc_stor = proc_metrics_.Get();
  assert(proc_stor.system_uptime > 0);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "getMetrics", GetMetrics);
  // While NODE_MODULE_INIT will run for every Worker, the first execution
  // won't run in parallel with another. So this won't cause a race condition.
  if (EnvInst::GetEnvLocalInst(context->GetIsolate())->thread_id() == 0) {
    node::AtExit(node::GetCurrentEnvironment(context), at_exit, nullptr);
  }
}
