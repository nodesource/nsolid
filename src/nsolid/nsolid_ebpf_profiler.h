#ifndef SRC_NSOLID_NSOLID_EBPF_PROFILER_H_
#define SRC_NSOLID_NSOLID_EBPF_PROFILER_H_

#include <memory>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>
#include <unordered_map>

#include "v8-profiler.h"
#include "nsolid_util.h"
#include "nsuv-inl.h"
#include "nsolid_memory_mappings.h"
#include "thread_safe.h"

struct bpf_program;
struct profiler_bpf;
struct ring_buffer;

namespace node {
namespace nsolid {
class EBPFProfiler;
using SharedEBPFProfiler = std::shared_ptr<EBPFProfiler>;
using WeakEBPFProfiler = std::weak_ptr<EBPFProfiler>;

enum class FrameKind : uint32_t {
  kUnknown = 0,
  kV8Embedded = 1,
  kV8Jit = 2,
  kNativeMapped = 3
};

struct Frame {
  uintptr_t addr = 0;
  FrameKind kind = FrameKind::kUnknown;
  uint64_t relative_addr = 0;
  std::string build_id;
  std::string symbol_name;
  uint64_t symbol_offset = 0;
  v8::CodeEventType symbol_event_type = v8::CodeEventType::kUnknownType;
  std::string script_name;
  int32_t script_line = 0;
  int32_t script_column = 0;
};

inline FrameKind ClassifyFrame(uintptr_t addr,
                               const AddressRange& code_range,
                               const Mappings& mappings,
                               const Mapping*& native_mapping) {
  native_mapping = nullptr;
  if (code_range.contains(addr)) return FrameKind::kV8Jit;
  native_mapping = mappings.get_mapping(addr);
  return native_mapping == nullptr ? FrameKind::kUnknown :
                                     FrameKind::kNativeMapped;
}

// The mapping must come from the same mappings snapshot.
inline bool PopulateNativeFrameInfo(Frame* frame,
                                    const Mappings& mappings,
                                    const Mapping* mapping) {
  if (frame->kind != FrameKind::kNativeMapped)
    return false;

  if (mapping == nullptr) return false;
  if (!mapping->has_elf_vaddr) return false;
  frame->relative_addr = mapping->elf_address_for(frame->addr);
  frame->build_id = mappings.get_build_id(mapping->pathname_index);
  return true;
}

struct Stack {
  Stack() = default;
  explicit Stack(size_t depth) : frames(depth) {}
  std::vector<Frame> frames;
  uint64_t timestamp = 0;
  uint32_t tid = 0;
  uint64_t node_thread_id = UINT64_MAX;
};

class StackHook;
struct StackTraceHookFnHolder {
  std::function<void(Stack)> fn;
};

class EBPFProfiler : public std::enable_shared_from_this<EBPFProfiler> {
 public:
  explicit EBPFProfiler(uv_loop_t* loop);
  ~EBPFProfiler();

  static bool IsSupported();
  void Initialize();
  bool Enable();
  void Disable();
  bool AddThread(uint64_t tid);
  void RemoveThread(uint64_t tid);
  template <typename Cb>
  StackHook* AddStackTraceHook(Cb&& cb);

  const Mappings& GetMappings() const { return mappings_; }

 private:
  friend class EnvList;
  friend class StackHook;

  void DispatchStackTrace(Stack&& stack);

  static int handle_event(void* ctx, void* data, size_t data_size);
  static void handle_poll_cb(nsuv::ns_poll* poll,
                         int status,
                         int events,
                         WeakEBPFProfiler profiler);

  bool enable();
  void shutdown();
  bool init_ring_buffer();
  void process_event(void* data, size_t data_size);
  void process_stack_trace(void* data, size_t data_size);

  uv_loop_t* loop_;
  uint64_t pid_;
  profiler_bpf* skel_ = nullptr;
  bpf_program* prog_ = nullptr;
  int ring_buffer_fd_ = -1;
  ring_buffer* rb_ = nullptr;
  nsuv::ns_poll* ring_buffer_poll_ = nullptr;
  nsuv::ns_mutex thread_to_perf_fd_map_lock_;
  std::unordered_map<uint64_t, int> thread_to_perf_fd_map_;
  TSList<StackTraceHookFnHolder> stack_trace_hooks_;
  Mappings mappings_;
  nsuv::ns_timer* ebpf_stack_flush_timer_ = nullptr;
};


class StackHook {
 public:
  using Iter = TSList<StackTraceHookFnHolder>::iterator;
  StackHook(std::weak_ptr<EBPFProfiler> profiler, Iter it)
      : profiler_(std::move(profiler)), it_(it) {}
  ~StackHook() { Dispose(); }
  void Dispose();
 private:
  std::weak_ptr<EBPFProfiler> profiler_;
  Iter it_;
  bool disposed_ = false;
};

template <typename Cb>
StackHook* EBPFProfiler::AddStackTraceHook(Cb&& cb) {
  auto it =
    stack_trace_hooks_.push_back(StackTraceHookFnHolder{std::forward<Cb>(cb)});
  return new StackHook(weak_from_this(), it);
}

}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_NSOLID_EBPF_PROFILER_H_
