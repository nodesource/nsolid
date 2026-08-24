#ifndef SRC_EBPF_PROFILER_VMLINUX_H_
#define SRC_EBPF_PROFILER_VMLINUX_H_

typedef unsigned char __u8;
typedef signed char __s8;
typedef unsigned short __u16;
typedef signed short __s16;
typedef unsigned int __u32;
typedef signed int __s32;
typedef unsigned long long __u64;
typedef signed long long __s64;

typedef __u32 u32;
typedef __u64 u64;
typedef __u16 __be16;
typedef __u32 __be32;
typedef __u32 __wsum;
typedef __s32 int32_t;
typedef __u32 uint32_t;
typedef __u64 uint64_t;

#define BPF_MAP_TYPE_HASH 1
#define BPF_MAP_TYPE_ARRAY 2
#define BPF_MAP_TYPE_RINGBUF 27
#define BPF_F_USER_STACK (1ULL << 8)

struct task_struct {
  unsigned int flags;
  int pid;
};

#endif  // SRC_EBPF_PROFILER_VMLINUX_H_
