#include <node.h>
#include <v8.h>
#include <uv.h>
#include <nsolid.h>
#include <statsd_agent.h>

#include <assert.h>
#include <atomic>

using v8::FunctionCallbackInfo;
using v8::String;
using v8::Value;

using node::nsolid::ProcessMetrics;
using node::nsolid::ThreadMetrics;
using node::nsolid::statsd::SharedStatsDAgent;
using node::nsolid::statsd::StatsDAgent;

SharedStatsDAgent agent;

static std::vector<std::string> pm(ProcessMetrics::MetricsStor stor) {
  std::vector<std::string> sv;
  std::string ms = "";
#define V(Type, CName, JSName, MType, Unit)                                    \
  ms = "proc.";                                                                \
  ms += #JSName ":";                                                           \
  ms += isnan(stor.CName) ?  "null" : std::to_string(stor.CName);              \
  ms += "|g\n";                                                                \
  sv.push_back(ms);
  NSOLID_PROCESS_METRICS_NUMBERS(V)
#undef V
  return sv;
}

static std::vector<std::string> tm(ThreadMetrics::MetricsStor stor) {
  std::vector<std::string> sv;
  std::string ms = "";
#define V(Type, CName, JSName, MType, Unit)                                    \
  ms = "thread.";                                                              \
  ms += #JSName ":";                                                           \
  ms += isnan(stor.CName) ?  "null" : std::to_string(stor.CName);              \
  ms += "|g|#threadId:";                                                       \
  ms += std::to_string(stor.thread_id);                                        \
  ms += "\n";                                                                  \
  sv.push_back(ms);
  NSOLID_ENV_METRICS_NUMBERS(V)
#undef V
  return sv;
}

static void SetAddHooks(const FunctionCallbackInfo<Value>& args) {
  assert(args[0]->IsString());
  const String::Utf8Value url(args.GetIsolate(), args[0]);
  agent = node::nsolid::statsd::StatsDAgent::Create();
  agent->config({{"statsd", *url},
                 {"interval", 3000},
                 {"pauseMetrics", false}});
  agent->set_pmetrics_transform_cb(pm);
  agent->set_tmetrics_transform_cb(tm);
}

static void GetStatus(const FunctionCallbackInfo<Value>& args) {
  if (!agent)
    return args.GetReturnValue().SetNull();
  args.GetReturnValue().Set(String::NewFromOneByte(
        args.GetIsolate(),
        reinterpret_cast<const uint8_t*>(agent->status().c_str()),
        v8::NewStringType::kNormal).ToLocalChecked());
}


NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "setAddHooks", SetAddHooks);
  NODE_SET_METHOD(exports, "getStatus", GetStatus);
}
