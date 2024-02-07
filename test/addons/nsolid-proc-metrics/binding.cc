#include <node.h>
#include <v8.h>
#include <nsolid.h>

#include <assert.h>

node::nsolid::ProcessMetrics proc_metrics_;
node::nsolid::ProcessMetrics::MetricsStor proc_stor;

static void GetMetrics(const v8::FunctionCallbackInfo<v8::Value>& args) {
  assert(0 == proc_metrics_.Update());
  proc_stor = proc_metrics_.Get();
  assert(proc_stor.system_uptime > 0);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "getMetrics", GetMetrics);
}
