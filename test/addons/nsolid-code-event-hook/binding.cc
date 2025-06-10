#include <node.h>
#include <v8.h>
#include <nsolid.h>
#include "../../../deps/nsuv/include/nsuv-inl.h"
#include <cassert>
#include <map>
#include <memory>

using node::nsolid::CodeEventHook;

using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::Global;
using v8::Isolate;
using v8::Local;
using v8::Number;
using v8::String;
using v8::Uint32;
using v8::Undefined;
using v8::Value;

namespace {

struct CustomDeleter {
  void operator()(CodeEventHook* hook) const {
    hook->Dispose();
  }
};

struct HookHolder {
  std::unique_ptr<CodeEventHook, CustomDeleter> hook;
  std::map<uint64_t, Global<Function>> js_callback_per_thread;
};

std::vector<std::unique_ptr<HookHolder>> hooks;
nsuv::ns_mutex hooks_mutex_;

void CodeEventCallback(std::shared_ptr<node::nsolid::EnvInst> envinst,
                       const node::nsolid::CodeEventInfo& info,
                       HookHolder* holder) {
  assert(0 == node::nsolid::RunCommand(
      envinst,
      node::nsolid::CommandType::EventLoop,
      [holder](node::nsolid::SharedEnvInst envinst,
               const node::nsolid::CodeEventInfo& info) {
    // Call JS callback with function name
    if (!holder->js_callback_per_thread[info.thread_id].IsEmpty()) {
      Isolate* isolate = Isolate::GetCurrent();
      v8::HandleScope scope(isolate);
      Local<Function> cb =
        holder->js_callback_per_thread[info.thread_id].Get(isolate);
      Local<Value> argv[2] = {
        String::NewFromUtf8(isolate, info.fn_name.c_str()).ToLocalChecked(),
        Number::New(isolate, info.thread_id),
      };
      // Call the callback in the current context
      cb->Call(isolate->GetCurrentContext(),
               Undefined(isolate), 2, argv).ToLocalChecked();
    }
  }, info));
}

void RegisterJSCodeEventCallback(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  assert(args[0]->IsUint32());
  uint32_t index = args[0].As<Uint32>()->Value();
  assert(args[1]->IsFunction());
  Local<Function> cb = Local<Function>::Cast(args[1]);
  uint64_t thread_id =
    node::nsolid::GetThreadId(node::nsolid::GetLocalEnvInst(isolate));

  nsuv::ns_mutex::scoped_lock lock(hooks_mutex_);
  assert(index < hooks.size());
  assert(hooks[index]);
  HookHolder* holder = hooks[index].get();
  holder->js_callback_per_thread[thread_id].Reset(isolate, cb);
}

void RegisterCodeEventHook(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  auto holder = std::make_unique<HookHolder>();
  HookHolder* holder_ptr = holder.get();
  holder->hook.reset(node::nsolid::AddCodeEventHook(CodeEventCallback,
                                                    holder_ptr));
  assert(holder->hook);
  nsuv::ns_mutex::scoped_lock lock(hooks_mutex_);
  hooks.push_back(std::move(holder));

  // Return index of the hook
  args.GetReturnValue().Set(static_cast<int>(hooks.size() - 1));
}

void UnregisterCodeEventHook(const FunctionCallbackInfo<Value>& args) {
  assert(args[0]->IsUint32());
  uint32_t index = args[0].As<Uint32>()->Value();
  nsuv::ns_mutex::scoped_lock lock(hooks_mutex_);
  assert(index < hooks.size());
  assert(hooks[index]);
  HookHolder* holder = hooks[index].get();
  holder->hook.reset();
  holder->js_callback_per_thread.clear();
}

void TriggerCodeEvent(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  Local<String> src =
    String::NewFromUtf8Literal(isolate,
                               "(function(){ function nsolidTestEvent(){}; "
                               "nsolidTestEvent(); })();");
  Local<v8::Script> script = v8::Script::Compile(context, src).ToLocalChecked();
  script->Run(context).ToLocalChecked();
}

void UnregisterAllHooks(const v8::FunctionCallbackInfo<v8::Value>&) {
  nsuv::ns_mutex::scoped_lock lock(hooks_mutex_);
  for (auto& hook : hooks) {
    if (hook) {
      hook->hook.reset();
      hook->js_callback_per_thread.clear();
    }
  }
  hooks.clear();
}

}  // namespace

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports,
                  "registerJSCodeEventCallback",
                  RegisterJSCodeEventCallback);
  NODE_SET_METHOD(exports, "registerCodeEventHook", RegisterCodeEventHook);
  NODE_SET_METHOD(exports, "unregisterCodeEventHook", UnregisterCodeEventHook);
  NODE_SET_METHOD(exports, "triggerCodeEvent", TriggerCodeEvent);
  NODE_SET_METHOD(exports, "unregisterAllHooks", UnregisterAllHooks);
  node::nsolid::SharedEnvInst envinst = node::nsolid::GetLocalEnvInst(context);
  if (node::nsolid::IsMainThread(envinst)) {
    assert(0 == hooks_mutex_.init(true));
  }
}
