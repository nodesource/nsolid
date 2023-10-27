#include <node.h>
#include <v8.h>
#include <nsolid.h>

#include <assert.h>
#include <atomic>

using node::nsolid::ProcessMetrics;
using node::nsolid::ThreadMetrics;

using v8::FunctionCallbackInfo;
using v8::String;
using v8::Uint32;
using v8::Value;

std::atomic<int> cb_cntr = { 0 };

static void metrics_cb(ThreadMetrics* tm, void*, ThreadMetrics*) {
  cb_cntr++;
  delete tm;
}

static void GetEnvMetrics(const FunctionCallbackInfo<Value>& args) {
  assert(args[0]->IsNumber());

  uint64_t thread_id = args[0].As<Uint32>()->Value();
  auto* tm = new ThreadMetrics(node::nsolid::GetEnvInst(thread_id));

  args.GetReturnValue().Set(tm->Update(metrics_cb, nullptr, tm));
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

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "getCbCntr", GetCbCntr);
  NODE_SET_METHOD(exports, "getEnvMetrics", GetEnvMetrics);
  NODE_SET_METHOD(exports, "getProcMetrics", GetProcMetrics);
}
