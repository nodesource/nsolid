#ifndef SRC_NSOLID_NSOLID_CODE_EVENT_HANDLER_H_
#define SRC_NSOLID_NSOLID_CODE_EVENT_HANDLER_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include "v8.h"
#include "v8-profiler.h"

namespace node {
namespace nsolid {

class NSolidCodeEventHandler: public v8::CodeEventHandler {
 public:
  NSolidCodeEventHandler(v8::Isolate* isolate, uint64_t thread_id);
  virtual ~NSolidCodeEventHandler();

  void Handle(v8::CodeEvent* code_event) override;

 private:
  v8::Isolate* isolate_;
  uint64_t thread_id_;
};
}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_NSOLID_CODE_EVENT_HANDLER_H_
