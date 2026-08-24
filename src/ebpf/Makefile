ARCH = $(shell uname -m | sed 's/x86_64/x86/' | sed 's/aarch64/arm64/')
CLANG ?= clang
LLVM_STRIP ?= llvm-strip
BPFTOOL ?= $(shell versioned=$$(find /usr/lib -type f -path "*/linux-tools*/bpftool" -executable 2>/dev/null | sort -V | tail -1); if [ -n "$$versioned" ]; then echo "$$versioned"; else fallback=$$(command -v bpftool 2>/dev/null); if [ -n "$$fallback" ] && "$$fallback" version >/dev/null 2>&1; then echo "$$fallback"; fi; fi)
ifeq ($(strip $(BPFTOOL)),)
$(error working bpftool not found; install linux-tools-generic or set BPFTOOL)
endif
LIBBPF_DIR = ../../deps/libbpf
LIBBPF_SRC = $(LIBBPF_DIR)/src

all: profiler/profiler.bpf.o profiler/profiler.skel.h

profiler/profiler.bpf.o: profiler/profiler.bpf.c profiler/vmlinux.h
	$(CLANG) -I $(LIBBPF_DIR) -I $(LIBBPF_SRC) -target bpf -D __TARGET_ARCH_$(ARCH) \
		-Wall -O2 -g -o $@ -c $<
	@if command -v $(LLVM_STRIP) >/dev/null 2>&1; then \
		$(LLVM_STRIP) -g $@; \
	else \
		echo "warning: $(LLVM_STRIP) not found; keeping eBPF debug information"; \
	fi

profiler/profiler.skel.h: profiler/profiler.bpf.o
	LIBBPF_PATH=$(LIBBPF_SRC) $(BPFTOOL) gen skeleton $< > $@.tmp
	sed 's|#include <bpf/libbpf.h>|#include "$(LIBBPF_SRC)/libbpf.h"|g' $@.tmp > $@
	rm $@.tmp

clean:
	- rm -f profiler/profiler.bpf.o profiler/profiler.skel.h

.PHONY: all clean
