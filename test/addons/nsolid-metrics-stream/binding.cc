#include <node.h>
#include <env-inl.h>
#include <util-inl.h>
#include <v8.h>
#include <nsolid.h>
#include "../../../deps/nsuv/include/nsuv-inl.h"

#include <assert.h>
#include <map>
#include <tuple>
#include <vector>

using v8::Array;
using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::Global;
using v8::HandleScope;
using v8::Isolate;
using v8::Local;
using v8::Number;
using v8::Object;
using v8::PersistentBase;
using v8::String;
using v8::Uint32;
using v8::Value;

using node::nsolid::MetricsStream;
using node::nsolid::SharedEnvInst;
using metrics_stream_bucket = MetricsStream::metrics_stream_bucket;


#define KDns MetricsStream::Type::kDns
#define kGc MetricsStream::Type::kGc
#define KHttpClient MetricsStream::Type::kHttpClient
#define KHttpServer MetricsStream::Type::kHttpServer

std::unique_ptr<MetricsStream> metrics_stream_ = nullptr;
std::map<uint64_t, Global<Function>> cb_map_;
std::map<uint64_t, metrics_stream_bucket> buckets_map_;
nsuv::ns_mutex map_mutex_;

template <class TypeName>
static inline Local<TypeName> PersistentToLocalStrong(
    const PersistentBase<TypeName>& persistent) {
  assert(!persistent.IsWeak());
  return *reinterpret_cast<Local<TypeName>*>(
      const_cast<PersistentBase<TypeName>*>(&persistent));
}

static void at_exit(void*) {
  v8::Isolate* isolate = v8::Isolate::TryGetCurrent();
  if (isolate) {
    SharedEnvInst envinst = node::nsolid::GetLocalEnvInst(isolate);
    {
      nsuv::ns_mutex::scoped_lock lock(map_mutex_);
      auto iter = cb_map_.find(node::nsolid::GetThreadId(envinst));
      if (iter != cb_map_.end()) {
        cb_map_.erase(iter);
      }
    }
  }
}

static void got_metrics_stream_js_thread(node::nsolid::SharedEnvInst,
                                         MetricsStream* ms,
                                         metrics_stream_bucket bucket) {
  Isolate* isolate = Isolate::GetCurrent();
  auto envinst = node::nsolid::GetLocalEnvInst(isolate);
  uint64_t thread_id = node::nsolid::GetThreadId(envinst);
  HandleScope handle_scope(isolate);
  Local<Context> context = isolate->GetCurrentContext();
  Context::Scope context_scope(context);
  node::Environment* env = node::GetCurrentEnvironment(context);
  Local<Function> fn;
  {
    nsuv::ns_mutex::scoped_lock lock(map_mutex_);
    auto iter = cb_map_.find(thread_id);
    assert(iter != cb_map_.end());
    if (!env->can_call_into_js()) {
      cb_map_.erase(iter);
      return;
    }

    // Retrieve the v8::Function from the cb_map_
    fn = PersistentToLocalStrong(iter->second);
  }

  Local<Array> metrics_array = Array::New(isolate);
  Local<String> type_prop_name = node::FIXED_ONE_BYTE_STRING(isolate, "type");
  Local<String> value_prop_name = node::FIXED_ONE_BYTE_STRING(isolate, "value");
  for (size_t i = 0; i < bucket.size(); ++i) {
    const MetricsStream::Datapoint& dp(bucket[i]);
    Local<Object> elem = Object::New(isolate);
    uint32_t type = static_cast<uint32_t>(dp.type);
    elem->Set(context, type_prop_name, v8::Integer::New(isolate, type)).Check();
    elem->Set(context,
              value_prop_name,
              Number::New(isolate, dp.value)).Check();
    metrics_array->Set(context, i, elem).Check();
  }

  Local<Value> v = static_cast<Local<Value>>(metrics_array);
  fn->Call(context, Undefined(isolate), 1, &v).ToLocalChecked();
}

static void got_metrics_stream(MetricsStream* ms,
                               metrics_stream_bucket bucket,
                               void*) {
  for (MetricsStream::Datapoint& dp : bucket) {
    buckets_map_[dp.thread_id].push_back(std::move(dp));
  }

  for (auto& pair : buckets_map_) {
    int r = node::nsolid::RunCommand(node::nsolid::GetEnvInst(pair.first),
                                     node::nsolid::CommandType::EventLoop,
                                     got_metrics_stream_js_thread,
                                     ms,
                                     std::move(pair.second));
    if (r != 0) {
      // This might happen if the thread is not alive anymore.
    }
  }
}

static void GetMetricsStreamStart(const FunctionCallbackInfo<v8::Value>& args) {
  assert(2 == args.Length());
  assert(args[0]->IsUint32());
  assert(args[1]->IsFunction());
  Isolate* isolate = args.GetIsolate();

  auto envinst = node::nsolid::GetLocalEnvInst(isolate);
  uint64_t thread_id = node::nsolid::GetThreadId(envinst);
  assert(UINT64_MAX != thread_id);

  uint32_t flags = args[0].As<Uint32>()->Value();
  Global<Function> cb(isolate, args[1].As<Function>());

  {
    nsuv::ns_mutex::scoped_lock lock(map_mutex_);
    auto pair = cb_map_.emplace(thread_id, std::move(cb));
    assert(pair.second);
  }

  if (node::nsolid::IsMainThread(envinst)) {
    metrics_stream_.reset(MetricsStream::CreateInstance(flags,
                                                        got_metrics_stream,
                                                        nullptr));
    assert(metrics_stream_);
  }
}

static void GetMetricsStreamStop(const FunctionCallbackInfo<v8::Value>& args) {
  metrics_stream_.reset(nullptr);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "getMetricsStreamStart", GetMetricsStreamStart);
  NODE_SET_METHOD(exports, "getMetricsStreamStop", GetMetricsStreamStop);
  NODE_DEFINE_CONSTANT(exports, KDns);
  NODE_DEFINE_CONSTANT(exports, kGc);
  NODE_DEFINE_CONSTANT(exports, KHttpClient);
  NODE_DEFINE_CONSTANT(exports, KHttpServer);
  node::AtExit(node::GetCurrentEnvironment(context), at_exit, nullptr);
  // While NODE_MODULE_INIT will run for every Worker, the first execution
  // won't run in parallel with another. So this won't cause a race condition.
  node::nsolid::SharedEnvInst envinst = node::nsolid::GetLocalEnvInst(context);
  if (node::nsolid::IsMainThread(envinst)) {
    assert(0 == map_mutex_.init(true));
  }

  buckets_map_.emplace(node::nsolid::GetThreadId(envinst),
                       metrics_stream_bucket());
}
