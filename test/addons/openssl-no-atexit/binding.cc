#include <node.h>
#include <openssl/crypto.h>
#include <stdlib.h>

namespace {

#if OPENSSL_VERSION_MAJOR >= 3 && !defined(OPENSSL_IS_BORINGSSL)
void OnCleanup() {
  _Exit(42);
}

void Cleanup(const v8::FunctionCallbackInfo<v8::Value>& info) {
  OPENSSL_cleanup();
}
#endif

void Initialize(v8::Local<v8::Object> exports) {
#if OPENSSL_VERSION_MAJOR >= 3 && !defined(OPENSSL_IS_BORINGSSL)
  // Distinguish global cleanup from the requested process exit status.
  if (OPENSSL_atexit(OnCleanup) != 1) {
    abort();
  }
  NODE_SET_METHOD(exports, "cleanup", Cleanup);
#endif
}

}  // anonymous namespace

NODE_MODULE(NODE_GYP_MODULE_NAME, Initialize)
