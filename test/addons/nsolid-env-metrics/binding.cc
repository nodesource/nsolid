#include <nsolid.h>
#include <node.h>
#include <v8.h>

#include <assert.h>
#include <atomic>

std::atomic<int> cb_cntr = { 0 };

using node::nsolid::ThreadMetrics;
using node::nsolid::SharedThreadMetrics;

struct Metrics {
  SharedThreadMetrics tm;
};

static void got_env_metrics(SharedThreadMetrics tm_sp, Metrics* m) {
  assert(tm_sp == m->tm);
  cb_cntr++;
  delete m;
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

  Metrics* metrics = new Metrics{ThreadMetrics::Create(envinst)};

  int er = metrics->tm->Update(got_env_metrics, metrics);
  args.GetReturnValue().Set(er);
}

static void GetCbCntr(const v8::FunctionCallbackInfo<v8::Value>& args) {
  args.GetReturnValue().Set(cb_cntr);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "getCbCntr", GetCbCntr);
  NODE_SET_METHOD(exports, "getMetrics", GetMetrics);
}
