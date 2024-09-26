#include <node.h>
#include <v8.h>
#include <nsolid.h>

#include <assert.h>
#include <atomic>

using node::nsolid::GetEnvInst;
using node::nsolid::ProcessMetrics;
using node::nsolid::SharedThreadMetrics;
using node::nsolid::ThreadMetrics;

using v8::FunctionCallbackInfo;
using v8::String;
using v8::Uint32;
using v8::Value;

std::atomic<int> cb_cntr = { 0 };
std::atomic<int> cb_cntr_lambda = { 0 };
std::atomic<int> cb_cntr_gone = { 0 };

struct Metrics {
  SharedThreadMetrics tm;
};

static void metrics_cb(SharedThreadMetrics tm, void*, Metrics* m) {
  assert(tm == m->tm);
  cb_cntr++;
  delete m;
}

static void metrics_cb_gone(SharedThreadMetrics tm, void*, ThreadMetrics*) {
  cb_cntr_gone++;
}

static void GetEnvMetrics(const FunctionCallbackInfo<Value>& args) {
  assert(args[0]->IsNumber());
  uint64_t thread_id = args[0].As<Uint32>()->Value();
  Metrics* metrics = new Metrics{ThreadMetrics::Create(GetEnvInst(thread_id))};
  args.GetReturnValue().Set(metrics->tm->Update(metrics_cb, nullptr, metrics));
}

static void GetEnvMetricsGone(const FunctionCallbackInfo<Value>& args) {
  assert(args[0]->IsNumber());
  uint64_t thread_id = args[0].As<Uint32>()->Value();
  SharedThreadMetrics tm = ThreadMetrics::Create(GetEnvInst(thread_id));
  // The cb should never be called as SharedThreadMetrics is destroyed right
  // after leaving the current scope.
  args.GetReturnValue().Set(tm->Update(metrics_cb_gone, nullptr, tm.get()));
}

static void GetEnvMetricsLambda(const FunctionCallbackInfo<Value>& args) {
  assert(args[0]->IsNumber());
  uint64_t thread_id = args[0].As<Uint32>()->Value();
  Metrics* metrics = new Metrics{ThreadMetrics::Create(GetEnvInst(thread_id))};
  int ret = metrics->tm->Update([](SharedThreadMetrics tm, void*, Metrics* m) {
    assert(tm == m->tm);
    cb_cntr_lambda++;
    delete m;
  }, nullptr, metrics);
  args.GetReturnValue().Set(ret);
}

static void GetProcMetrics(const FunctionCallbackInfo<Value>& args) {
  ProcessMetrics pm;

  int er = pm.Update();

  if (er)
    return args.GetReturnValue().Set(er);
  args.GetReturnValue().Set(String::NewFromUtf8(
        args.GetIsolate(),
        pm.toJSON().c_str(),
        v8::NewStringType::kNormal).ToLocalChecked());
}

static void GetCbCntr(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(cb_cntr);
}

static void GetCbCntrGone(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(cb_cntr_gone);
}

static void GetCbCntrLambda(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(cb_cntr_lambda);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "getCbCntr", GetCbCntr);
  NODE_SET_METHOD(exports, "getCbCntrGone", GetCbCntrGone);
  NODE_SET_METHOD(exports, "getCbCntrLambda", GetCbCntrLambda);
  NODE_SET_METHOD(exports, "getEnvMetrics", GetEnvMetrics);
  NODE_SET_METHOD(exports, "getEnvMetricsGone", GetEnvMetricsGone);
  NODE_SET_METHOD(exports, "getEnvMetricsLambda", GetEnvMetricsLambda);
  NODE_SET_METHOD(exports, "getProcMetrics", GetProcMetrics);
}
