#ifndef SRC_EBPF_PROFILER_PROFILER_H_
#define SRC_EBPF_PROFILER_PROFILER_H_

#define MAX_STACK_FRAMES 64

enum event_type {
  EVENT_STACK_TRACE = 0,
  EVENT_THREAD = 1,
};

enum thread_event_type {
  THREAD_FORK = 0,
  THREAD_EXIT = 1,
};

struct profiler_stats_t {
  uint64_t on_cpu_samples;
  uint64_t ringbuf_reserve_failures;
  uint64_t stack_successes;
  uint64_t stack_failures;
};

struct profiler_event {
  int32_t type;
  uint32_t pid;
  uint32_t tid;
  uint64_t timestamp;

  union {
    struct {
      int32_t user_stack_depth;
      uint64_t user_stack[MAX_STACK_FRAMES];
    } stack_trace;

    struct {
      int32_t type;
    } thread;
  };
};

struct config_t {
  int32_t pid;
};

#endif  // SRC_EBPF_PROFILER_PROFILER_H_
