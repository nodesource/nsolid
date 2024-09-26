#include <node.h>
#include <v8.h>
#include <nsolid.h>


#include <assert.h>
using error_tup = std::tuple<std::string, std::string>;
using exit_hook_tup = std::tuple<int, error_tup*, bool>;

static int hooks_set;
static int hooks_called;

static void at_exit_hook(bool on_signal,
                         bool profile_stopped,
                         exit_hook_tup* tup) {
  fprintf(stdout, "at_exit_hook");
  ++hooks_called;
  auto* error = node::nsolid::GetExitError();
  int exit_code = node::nsolid::GetExitCode();
  error_tup* e_tup = std::get<1>(*tup);
  if (error == nullptr) {
    assert(e_tup == nullptr);
  } else {
    assert(std::get<0>(*error) == std::get<0>(*e_tup));
    assert(std::get<1>(*error).rfind(std::get<1>(*e_tup), 0) == 0);
    delete e_tup;
  }

  assert(exit_code == std::get<0>(*tup));
  assert(on_signal == std::get<2>(*tup));
  assert(profile_stopped == false);
  delete tup;
}

// JS related functions //

static void SetExitInfo(const v8::FunctionCallbackInfo<v8::Value>& args) {
  v8::Isolate* isolate = args.GetIsolate();
  int exit_code = args[0].As<v8::Number>()->Value();
  error_tup* err;
  if (args[1]->IsNull()) {
    err = nullptr;
  } else {
    v8::Local<v8::Context> context = isolate->GetCurrentContext();
    v8::Local<v8::Array> err_array = args[1].As<v8::Array>();
    assert(err_array->Length() == 2);
    v8::String::Utf8Value message(
      isolate, err_array->Get(context, 0).ToLocalChecked());
    v8::String::Utf8Value stack(
      isolate, err_array->Get(context, 1).ToLocalChecked());
    err = new error_tup(*message, *stack);
  }

  bool signal = args[2].As<v8::Boolean>()->Value();
  auto* tup = new exit_hook_tup(exit_code, err, signal);
  node::nsolid::AtExitHook(at_exit_hook, tup);
  ++hooks_set;
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "setExitInfo", SetExitInfo);
}
