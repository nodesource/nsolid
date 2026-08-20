#include <node.h>
#include <uv.h>
#include <v8.h>
#include <nsolid.h>

#include <assert.h>

using v8::FunctionCallbackInfo;
using v8::Value;

std::atomic<int> interrupt_cb_cntr = { 0 };
std::atomic<int> interrupt_only_cb_cntr = { 0 };

static void interrupt_cb(node::nsolid::SharedEnvInst) {
  ++interrupt_cb_cntr;
}

static void interrupt_only_cb(node::nsolid::SharedEnvInst) {
  ++interrupt_only_cb_cntr;
}

// JS related functions //

void GetInterruptCntr(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(interrupt_cb_cntr.load());
}


void GetInterruptOnlyCntr(const FunctionCallbackInfo<Value>& args) {
  args.GetReturnValue().Set(interrupt_only_cb_cntr.load());
}


void RunInterrupt(const FunctionCallbackInfo<Value>& args) {
  assert(args[0]->IsNumber());
  uint64_t thread_id = args[0].As<v8::Uint32>()->Value();
  assert(0 == node::nsolid::RunCommand(node::nsolid::GetEnvInst(thread_id),
                                       node::nsolid::CommandType::Interrupt,
                                       interrupt_cb));
}

void RunInterruptOnly(const FunctionCallbackInfo<Value>& args) {
  assert(args[0]->IsNumber());
  uint64_t thread_id = args[0].As<v8::Uint32>()->Value();
  assert(0 == node::nsolid::RunCommand(node::nsolid::GetEnvInst(thread_id),
                                       node::nsolid::CommandType::InterruptOnly,
                                       interrupt_only_cb));
}

NODE_MODULE_INIT(/* exports, module, context */) {
  NODE_SET_METHOD(exports, "getInterruptCntr", GetInterruptCntr);
  NODE_SET_METHOD(exports, "getInterruptOnlyCntr", GetInterruptOnlyCntr);
  NODE_SET_METHOD(exports, "runInterrupt", RunInterrupt);
  NODE_SET_METHOD(exports, "runInterruptOnly", RunInterruptOnly);
}
