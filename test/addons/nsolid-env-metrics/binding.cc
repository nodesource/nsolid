#include <nsolid.h>
#include <node.h>
#include <v8.h>

#include <assert.h>
#include <atomic>

std::atomic<int> cb_cntr = { 0 };

using node::nsolid::ThreadMetrics;

static void got_env_metrics(ThreadMetrics* tm) {
  cb_cntr++;
  delete tm;
}

static void GetMetrics(const v8::FunctionCallbackInfo<v8::Value>& args) {
  node::nsolid::SharedEnvInst envinst;

  if (args[0]->IsNumber()) {
    uint64_t thread_id = args[0].As<v8::Number>()->Value();
    envinst = node::nsolid::GetEnvInst(thread_id);
    assert(envinst != nullptr);
  } else {
    envinst =
        node::nsolid::GetLocalEnvInst(args.GetIsolate()->GetCurrentContext());
    assert(envinst != nullptr);
  }

  auto* tm = new node::nsolid::ThreadMetrics(envinst);

  int er = tm->Update(got_env_metrics);
  if (er)
    delete tm;
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "getMetrics", GetMetrics);
}
