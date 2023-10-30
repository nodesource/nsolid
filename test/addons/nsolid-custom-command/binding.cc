#include <node.h>
#include <util-inl.h>
#include <v8.h>
#include <nsolid/nsolid_api.h>

#include <assert.h>
#include <memory>
#include <string>

using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::Global;
using v8::HandleScope;
using v8::Integer;
using v8::Isolate;
using v8::Local;
using v8::NewStringType;
using v8::Null;
using v8::PersistentBase;
using v8::String;
using v8::Undefined;
using v8::Value;

using node::nsolid::EnvInst;
using node::nsolid::EnvList;

std::map<std::string, Global<Function>> cb_map_;

template <class TypeName>
static inline Local<TypeName> PersistentToLocalStrong(
    const PersistentBase<TypeName>& persistent) {
  assert(!persistent.IsWeak());
  return *reinterpret_cast<Local<TypeName>*>(
      const_cast<PersistentBase<TypeName>*>(&persistent));
}

// While node::AtExit can run for any Environment, we only have this set to run
// on the Environment of the main thread. So by this point the env_map_size
// should equal 0.
static void at_exit(void*) {
  cb_map_.clear();
  assert(EnvList::Inst()->env_map_size() == 1);
}

static void custom_command_cb(std::string req_id,
                              std::string command,
                              int status,
                              std::pair<bool, std::string> error,
                              std::pair<bool, std::string> value) {
  auto iter = cb_map_.find(req_id);
  assert(iter != cb_map_.end());

  Isolate* isolate = Isolate::GetCurrent();
  Local<Context> context = isolate->GetCurrentContext();
  HandleScope handle_scope(isolate);
  Context::Scope context_scope(context);
  Local<Function> fn(PersistentToLocalStrong(iter->second));
  Local<Value> argv[5];
  argv[0] = String::NewFromUtf8(isolate,
                                req_id.c_str(),
                                NewStringType::kNormal).ToLocalChecked();
  argv[1] = String::NewFromUtf8(isolate,
                                command.c_str(),
                                NewStringType::kNormal).ToLocalChecked();
  argv[2] = Integer::New(isolate, status);
  if (error.first) {
    argv[3] = String::NewFromUtf8(isolate,
                                  error.second.c_str(),
                                  NewStringType::kNormal).ToLocalChecked();
    argv[4] = Null(isolate);
  } else {
    argv[3] = Null(isolate);
    argv[4] = String::NewFromUtf8(isolate,
                                  value.second.c_str(),
                                  NewStringType::kNormal).ToLocalChecked();
  }

  fn->Call(context,
           Undefined(isolate),
           5,
           argv).ToLocalChecked();

  cb_map_.erase(iter);
}

// JS related functions //

static void CustomCommand(const FunctionCallbackInfo<Value>& args) {
  assert(4 == args.Length());
  assert(args[0]->IsString());
  assert(args[1]->IsString());
  assert(args[2]->IsString());
  assert(args[3]->IsFunction());
  Isolate* isolate = args.GetIsolate();
  Local<Context> context = isolate->GetCurrentContext();
  auto envinst_sp = EnvInst::GetCurrent(context);

  Local<String> req_id_s = args[0].As<String>();
  String::Utf8Value req_id(isolate, req_id_s);
  Local<String> command_s = args[1].As<String>();
  String::Utf8Value command(isolate, command_s);
  Local<String> value_s = args[2].As<String>();
  String::Utf8Value value(isolate, value_s);

  Global<Function> cb(isolate, args[3].As<Function>());
  auto iter = cb_map_.emplace(*req_id, std::move(cb));
  assert(iter.second);

  node::nsolid::CustomCommand(envinst_sp,
                              *req_id,
                              *command,
                              *value,
                              custom_command_cb);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "customCommand", CustomCommand);
  // While NODE_MODULE_INIT will run for every Worker, the first execution
  // won't run in parallel with another. So this won't cause a race condition.
  if (EnvInst::GetEnvLocalInst(context->GetIsolate())->thread_id() == 0)
    node::AtExit(node::GetCurrentEnvironment(context), at_exit, nullptr);
}
