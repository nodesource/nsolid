#include "nsolid_code_event_handler.h"
#include "nsolid_api.h"

namespace node {
namespace nsolid {

using v8::CodeEvent;
using v8::Isolate;

NSolidCodeEventHandler::NSolidCodeEventHandler(
    Isolate* isolate,
    uint64_t thread_id,
    std::shared_ptr<AsyncTSQueue<CodeEventInfo>> queue):
    CodeEventHandler(isolate),
    isolate_(isolate),
    thread_id_(thread_id),
    queue_(std::move(queue)) {
}

void NSolidCodeEventHandler::Handle(CodeEvent* code_event) {
  v8::HandleScope handle_scope(isolate_);
  // ponytail: use direct WriteUtf8V2() conversion if string allocation shows
  // up as a profiling hotspot.
  std::string fn_name = *Utf8Value(isolate_, code_event->GetFunctionName());
  std::string script_name = *Utf8Value(isolate_, code_event->GetScriptName());
  int script_line = code_event->GetScriptLine();
  int script_column = code_event->GetScriptColumn();
  v8::CodeEventType type = code_event->GetCodeType();
  uintptr_t prev = type == v8::CodeEventType::kRelocationType ?
    code_event->GetPreviousCodeStartAddress() : 0;
  CodeEventInfo info {
      thread_id_,
      uv_hrtime(),
      type,
      code_event->GetCodeStartAddress(),
      prev,
      code_event->GetCodeSize(),
      fn_name,
      script_name,
      script_line,
      script_column,
      std::string(code_event->GetComment())
    };

    queue_->enqueue(std::move(info));
}

}  // namespace nsolid
}  // namespace node
