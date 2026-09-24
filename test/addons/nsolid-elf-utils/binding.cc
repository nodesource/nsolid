#include <node.h>
#include <v8.h>
#include <cassert>
#include <string>
#if defined(__linux__)
#include "../../../src/nsolid/nsolid_elf_utils.h"
#endif

using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::String;
using v8::Value;

static void GetBuildId(const FunctionCallbackInfo<Value>& args) {
#if defined(__linux__)
  Isolate* isolate = args.GetIsolate();
  assert(args[0]->IsString());
  v8::String::Utf8Value path_utf8(isolate, args[0]);
  std::string path(*path_utf8, path_utf8.length());
  std::string build_id;
  int res = node::nsolid::elf_utils::GetBuildId(path, &build_id);
  if (res != 0) {
    return;
  }

  args.GetReturnValue().Set(
    String::NewFromUtf8(isolate, build_id.c_str()).ToLocalChecked());
#endif
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "getBuildId", GetBuildId);
}
