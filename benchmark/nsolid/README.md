# N|Solid benchmarks

## Native frame mapping lookup

```sh
out/Release/cctest --gtest_also_run_disabled_tests \
  --gtest_filter=EBPFProfilerTest.DISABLED_NativeFrameMappingBenchmark
```

This benchmark compares `duplicate` and `reuse` lookup paths in the same
binary. Each row measures 10,000 frame classifications and metadata population
calls over 100, 1,000, or 10,000 mappings. `first` and `last` hit the first
and last mapping; `unknown` searches the full vector without a match; `jit`
hits a JIT range that overlaps a native mapping and takes precedence.

Mapping setup and output assertions are outside timing. Native rows include
ELF-address calculation and build-ID copying. There is no BPF sampling or
mapping refresh. Both modes use the same binary and mapping vector, so no
separate baseline build is needed. Repeat runs and compare medians per row;
small JIT/unknown differences can reflect measurement noise.

