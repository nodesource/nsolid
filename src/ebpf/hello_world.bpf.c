// vmlinux.h contains all kernel types needed (auto-generated)
#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_core_read.h>
#include <bpf/bpf_tracing.h>

char LICENSE[] SEC("license") = "Dual BSD/GPL";

SEC("kprobe/sys_execve")
int bpf_prog_hello_world(struct pt_regs *ctx) {
    char msg[] = "Hello from eBPF (CO-RE)!\n";
    
    // Get the process details using CO-RE macros
    struct task_struct *task = (struct task_struct*)bpf_get_current_task();
    pid_t pid = BPF_CORE_READ(task, pid);
    
    // Print using bpf_printk
    bpf_printk("%s PID: %d\n", msg, pid);
    return 0;
}

