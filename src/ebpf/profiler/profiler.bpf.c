#include "vmlinux.h"
#include "bpf_core_read.h"
#include "bpf_helpers.h"
#include "bpf_tracing.h"
#include "profiler.h"

#define PF_KTHREAD 0x00200000

struct {
  __uint(type, BPF_MAP_TYPE_RINGBUF);
  __uint(max_entries, 256 * 1024);
} rb SEC(".maps");

struct {
  __uint(type, BPF_MAP_TYPE_ARRAY);
  __uint(max_entries, 1);
  __type(key, u32);
  __type(value, struct profiler_stats_t);
} stats_map SEC(".maps");

static inline struct profiler_stats_t* get_stats(void) {
  u32 key = 0;
  return bpf_map_lookup_elem(&stats_map, &key);
}

static inline void submit_stack_trace(void* ctx, int pid, int tid) {
  struct profiler_stats_t* stats = get_stats();
  if (stats != 0)
    __sync_fetch_and_add(&stats->on_cpu_samples, 1);

  struct profiler_event* event = bpf_ringbuf_reserve(&rb, sizeof(*event), 0);
  if (event == 0) {
    if (stats != 0)
      __sync_fetch_and_add(&stats->ringbuf_reserve_failures, 1);
    return;
  }

  event->type = EVENT_STACK_TRACE;
  event->pid = pid;
  event->tid = tid;
  event->timestamp = bpf_ktime_get_ns();

  int user_bytes = bpf_get_stack(ctx, event->stack_trace.user_stack,
                                 sizeof(event->stack_trace.user_stack),
                                 BPF_F_USER_STACK);
  if (user_bytes < 0) {
    event->stack_trace.user_stack_depth = user_bytes;
    if (stats != 0)
      __sync_fetch_and_add(&stats->stack_failures, 1);
  } else {
    event->stack_trace.user_stack_depth = user_bytes / sizeof(uint64_t);
    if (stats != 0)
      __sync_fetch_and_add(&stats->stack_successes, 1);
  }

  bpf_ringbuf_submit(event, 0);
}

SEC("perf_event")
int on_cpu_sample(struct bpf_perf_event_data* ctx) {
  u64 id = bpf_get_current_pid_tgid();
  u32 pid = id >> 32;
  u32 tid = id;
  submit_stack_trace(ctx, pid, tid);
  return 0;
}

SEC("tp_btf/sched_process_fork")
int BPF_PROG(handle_fork, const struct task_struct* parent,
             const struct task_struct* child) {
  if (BPF_CORE_READ(child, flags) & PF_KTHREAD)
    return 0;

  struct profiler_event* event = bpf_ringbuf_reserve(&rb, sizeof(*event), 0);
  if (event == 0)
    return 0;

  u32 parent_pid = bpf_get_current_pid_tgid() >> 32;
  u32 child_pid = BPF_CORE_READ(child, pid);
  event->type = EVENT_THREAD;
  event->pid = parent_pid;
  event->tid = child_pid;
  event->thread.type = THREAD_FORK;
  bpf_ringbuf_submit(event, 0);
  return 0;
}

SEC("tp_btf/sched_process_exit")
int BPF_PROG(handle_exit, const struct task_struct* task) {
  struct profiler_event* event = bpf_ringbuf_reserve(&rb, sizeof(*event), 0);
  if (event == 0)
    return 0;

  u64 id = bpf_get_current_pid_tgid();
  u32 pid = id >> 32;
  u32 tid = id;
  event->type = EVENT_THREAD;
  event->pid = pid;
  event->tid = tid;
  event->thread.type = THREAD_EXIT;
  bpf_ringbuf_submit(event, 0);
  return 0;
}

char LICENSE[] SEC("license") = "GPL";
