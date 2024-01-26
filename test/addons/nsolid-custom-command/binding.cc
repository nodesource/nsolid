#include <node.h>
#include <util-inl.h>
#include <v8.h>
#include <nsolid.h>

#include <assert.h>
#include <map>
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

std::map<std::string, Global<Function>> cb_map_;

template <class TypeName>
static inline Local<TypeName> PersistentToLocalStrong(
    const PersistentBase<TypeName>& persistent) {
  assert(!persistent.IsWeak());
  return *reinterpret_cast<Local<TypeName>*>(
      const_cast<PersistentBase<TypeName>*>(&persistent));
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
           argv);

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
  node::nsolid::SharedEnvInst envinst_sp = node::nsolid::GetLocalEnvInst(context);

  Local<String> req_id_s = args[0].As<String>();
  String::Utf8Value req_id(isolate, req_id_s);
  Local<String> command_s = args[1].As<String>();
  String::Utf8Value command(isolate, command_s);
  Local<String> value_s = args[2].As<String>();
  String::Utf8Value value(isolate, value_s);

  int err = node::nsolid::CustomCommand(envinst_sp,
                                        *req_id,
                                        *command,
                                        *value,
                                        custom_command_cb);

  if (err == 0) {
    Global<Function> cb(isolate, args[3].As<Function>());
    auto iter = cb_map_.emplace(*req_id, std::move(cb));
    assert(iter.second);
  }

  args.GetReturnValue().Set(err);
}

static void CustomCommandThread(const FunctionCallbackInfo<Value>& args) {
  assert(4 == args.Length());
  assert(args[0]->IsNumber());
  assert(args[1]->IsString());
  assert(args[2]->IsString());
  assert(args[3]->IsString());
  Isolate* isolate = args.GetIsolate();
  uint64_t thread_id = args[0].As<v8::Number>()->Value();
  Local<String> req_id_s = args[1].As<String>();
  String::Utf8Value req_id(isolate, req_id_s);
  Local<String> command_s = args[2].As<String>();
  String::Utf8Value command(isolate, command_s);
  Local<String> value_s = args[3].As<String>();
  String::Utf8Value value(isolate, value_s);

  auto envinst_sp = node::nsolid::GetEnvInst(thread_id);

  int err = node::nsolid::CustomCommand(envinst_sp,
                                        *req_id,
                                        *command,
                                        *value,
                                        custom_command_cb);
  args.GetReturnValue().Set(err);
}

static void SetCustomCommandCb(const FunctionCallbackInfo<Value>& args) {
  assert(2 == args.Length());
  assert(args[0]->IsString());
  assert(args[1]->IsFunction());
  Isolate* isolate = args.GetIsolate();
  Local<String> req_id_s = args[0].As<String>();
  String::Utf8Value req_id(isolate, req_id_s);
  Global<Function> cb(isolate, args[1].As<Function>());
  auto iter = cb_map_.emplace(*req_id, std::move(cb));
  assert(iter.second);
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "customCommand", CustomCommand);
  NODE_SET_METHOD(exports, "customCommandThread", CustomCommandThread);
  NODE_SET_METHOD(exports, "setCustomCommandCb", SetCustomCommandCb);
}
