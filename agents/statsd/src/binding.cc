#include "node_internals.h"
#include "node_external_reference.h"
#include "statsd_agent.h"
#include "util.h"

using v8::Array;
using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::Global;
using v8::HandleScope;
using v8::Isolate;
using v8::JSON;
using v8::Local;
using v8::NewStringType;
using v8::Object;
using v8::String;
using v8::Value;

namespace node {
namespace nsolid {
namespace statsd {

using GFunction = Global<Function>;
using status_cb_pair = std::pair<GFunction, status_cb>;

static status_cb_pair* status_cb_pair_ = nullptr;

static void at_exit(void*) {
  delete status_cb_pair_;
  status_cb_pair_ = nullptr;
}

static void Bucket(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  std::string bucket = StatsDAgent::Inst()->bucket();
  args.GetReturnValue().Set(
    String::NewFromUtf8(isolate,
                        bucket.c_str(),
                        NewStringType::kNormal).ToLocalChecked());
}

static void Status(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  if (!StatsDAgent::is_running_) {
    args.GetReturnValue().Set(
      String::NewFromUtf8(isolate,
                          "unconfigured",
                          NewStringType::kNormal).ToLocalChecked());
    return;
  }

  args.GetReturnValue().Set(
    String::NewFromUtf8(isolate,
                        StatsDAgent::Inst()->status().c_str(),
                        NewStringType::kNormal).ToLocalChecked());
}

static void Send(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  ASSERT(args[0]->IsArray());
  Local<Array> strings = args[0].As<Array>();
  uint32_t len = strings->Length();
  size_t full_size = 0;
  std::vector<std::string> sv(len);
  for (uint32_t i = 0; i < len; i++) {
    auto el = strings->Get(context, i).ToLocalChecked().As<String>();
    String::Utf8Value str(isolate, el);
    sv.push_back(std::string(*str) + '\n');
    full_size += sv.back().length();
  }

  args.GetReturnValue().Set(StatsDAgent::Inst()->send(sv, full_size));
}

static void Start(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(StatsDAgent::Inst()->start());
}

static void Stop(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(StatsDAgent::Inst()->stop());
}

static void Tags(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  std::string tags = StatsDAgent::Inst()->tags();
  args.GetReturnValue().Set(
    String::NewFromUtf8(isolate,
                        tags.c_str(),
                        NewStringType::kNormal).ToLocalChecked());
}

static void TcpIp(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  std::string tcp_ip = StatsDAgent::Inst()->tcp_ip();
  if (tcp_ip.empty()) {
    args.GetReturnValue().SetNull();
  } else {
    args.GetReturnValue().Set(
      String::NewFromUtf8(isolate,
                          tcp_ip.c_str(),
                          NewStringType::kNormal).ToLocalChecked());
  }
}

static void UdpIp(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  std::string udp_ip = StatsDAgent::Inst()->udp_ip();
  if (udp_ip.empty()) {
    args.GetReturnValue().SetNull();
  } else {
    args.GetReturnValue().Set(
      String::NewFromUtf8(isolate,
                          udp_ip.c_str(),
                          NewStringType::kNormal).ToLocalChecked());
  }
}

// This binding is only for testing and should only be called if
// Start has already been called
static void Config(const FunctionCallbackInfo<Value>& args) {
  // It should not be called if not started
  ASSERT_STR_NE(StatsDAgent::Inst()->status().c_str(), "unconfigured");
  ASSERT(args[0]->IsObject());
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  Local<Object> obj = args[0].As<Object>();
  Local<String> stringify = JSON::Stringify(context, obj).ToLocalChecked();
  String::Utf8Value cfg(isolate, stringify);
  StatsDAgent::config_agent_cb(*cfg, StatsDAgent::Inst());
}

// This binding is only for testing and should only be called once
static void RegisterStatusCb(const FunctionCallbackInfo<Value>& args) {
  ASSERT_PTR_EQ(nullptr, status_cb_pair_);
  Isolate* isolate = args.GetIsolate();
  ASSERT_NULL(status_cb_pair_);
  status_cb_pair_ = new status_cb_pair(
    std::piecewise_construct,
    std::forward_as_tuple(isolate, args[0].As<Function>()),
    std::forward_as_tuple([](const std::string& status) {
      ASSERT_NOT_NULL(status_cb_pair_);
      Isolate* isolate = Isolate::GetCurrent();
      HandleScope scope(isolate);
      Local<Context> context = isolate->GetCurrentContext();
      Context::Scope context_scope(context);
      Local<Function> cb = ::node::PersistentToLocal::Strong(
          status_cb_pair_->first);
      Local<Value> argv = String::NewFromUtf8(
        isolate,
        status.c_str(),
        NewStringType::kNormal).ToLocalChecked();

      USE(cb->Call(context, Undefined(isolate), 1, &argv));
    }));

  ASSERT_NOT_NULL(status_cb_pair_);
  StatsDAgent::Inst()->set_status_cb(status_cb_pair_->second);
}

static void RegisterExternalReferences(ExternalReferenceRegistry* registry) {
  registry->Register(Bucket);
  registry->Register(Send);
  registry->Register(Start);
  registry->Register(Status);
  registry->Register(Stop);
  registry->Register(Tags);
  registry->Register(TcpIp);
  registry->Register(UdpIp);
  registry->Register(Config);
  registry->Register(RegisterStatusCb);
}

void InitStatsDAgent(Local<Object> exports,
                     Local<Value> unused,
                     Local<Context> context,
                     void* priv) {
  NODE_SET_METHOD(exports, "status", Status);
  // status is the only method exported to worker threads
  if (ThreadId(context) != 0) {
    return;
  }

  NODE_SET_METHOD(exports, "bucket", Bucket);
  NODE_SET_METHOD(exports, "send", Send);
  NODE_SET_METHOD(exports, "start", Start);
  NODE_SET_METHOD(exports, "stop", Stop);
  NODE_SET_METHOD(exports, "tags", Tags);
  NODE_SET_METHOD(exports, "tcpIp", TcpIp);
  NODE_SET_METHOD(exports, "udpIp", UdpIp);
  // Only for testing
  NODE_SET_METHOD(exports, "config", Config);
  NODE_SET_METHOD(exports, "_registerStatusCb", RegisterStatusCb);
  node::AddEnvironmentCleanupHook(context->GetIsolate(), at_exit, nullptr);
}

}  // namespace statsd
}  // namespace nsolid
}  // namespace node

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS
NODE_BINDING_CONTEXT_AWARE_INTERNAL(nsolid_statsd_agent,
                                   node::nsolid::statsd::InitStatsDAgent)
#else
NODE_MODULE_INIT(/* exports, module, context */) {
  node::nsolid::statsd::InitStatsDAgent(exports, module, context, nullptr);
}
#endif

NODE_BINDING_EXTERNAL_REFERENCE(
    nsolid_statsd_agent, node::nsolid::statsd::RegisterExternalReferences)
