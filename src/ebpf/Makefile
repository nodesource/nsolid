TARGET = hello_world
ARCH = $(shell uname -m | sed 's/x86_64/x86/' | sed 's/aarch64/arm64/')

BPF_OBJ = ${TARGET:=.bpf.o}
USER_C = ${TARGET:=.c}
USER_SKEL = ${TARGET:=.skel.h}

# Path to deps/libbpf
LIBBPF_DIR = ../../deps/libbpf
LIBBPF_SRC = $(LIBBPF_DIR)/src

all: $(BPF_OBJ) $(USER_SKEL) 
.PHONY: all 

$(TARGET): $(USER_C) $(USER_SKEL) 
	gcc -Wall -I$(LIBBPF_SRC) -o $(TARGET) $(USER_C) -L$(LIBBPF_SRC) -l:libbpf.a -lelf -lz

%.bpf.o: %.bpf.c vmlinux.h
	clang-20 \
	    -target bpf \
        -D __TARGET_ARCH_$(ARCH) \
	    -Wall \
	    -O2 -g -o $@ -c $<
	llvm-strip-20 -g $@

$(USER_SKEL): $(BPF_OBJ)
	LIBBPF_PATH=$(LIBBPF_SRC) bpftool gen skeleton $< > $@.tmp
	sed 's|#include <bpf/libbpf.h>|#include "$(LIBBPF_SRC)/libbpf.h"|g' $@.tmp > $@
	rm $@.tmp

vmlinux.h:
	bpftool btf dump file /sys/kernel/btf/vmlinux format c > vmlinux.h

clean:
	- rm $(BPF_OBJ)
	- rm $(TARGET)