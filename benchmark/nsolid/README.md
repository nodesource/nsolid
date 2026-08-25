# eBPF symbol lookup benchmark

The opt-in C++ benchmark uses the existing Linux `cctest` target and calls
`V8CodeSymbolTable::Resolve()` directly. It does not enable eBPF and requires
no profiling capabilities. It is disabled during normal test runs.

After building the Release `cctest` target, run:

```sh
out/Release/cctest --gtest_also_run_disabled_tests \
  --gtest_filter=EBPFProfilerTest.DISABLED_V8CodeSymbolTableLookupBenchmark
```

The CSV rows report nanoseconds per lookup and cache hits/misses for 100,
1,000, and 10,000 live entries. Each row measures 10,000 lookups:

- `cached`: repeatedly resolve a prewarmed PC.
- `live`: resolve distinct PCs in live symbols, bypassing the cache.
- `history`: resolve distinct PCs in old versions, with one closed version
  per live entry. Live symbols are too recent for the sample timestamp.
- `unknown`: resolve addresses in gaps between symbols. Failed resolutions
  are not cached and exercise the backward scans.

Setup, ingestion, and correctness/cache assertions are outside the timed
region. Successful lookups include frame population and cache insertion.
The workload is synthetic: it isolates lookup scaling and does not measure
end-to-end profiling overhead or cache invalidation cost during JIT churn.

Run the same benchmark on the baseline and candidate revisions with the same
Release build settings and host. Repeat each run at least five times and
compare the median for each row; do not mix Debug and Release results. Copy
this benchmark to the baseline if it predates the benchmark addition.

## Symbol maintenance

```sh
out/Release/cctest --gtest_also_run_disabled_tests \
  --gtest_filter=EBPFProfilerTest.DISABLED_V8CodeSymbolTableMaintenanceBenchmark
```

This benchmark measures 1,000 repeated `EvictClosed()` sweeps across one or
eight symbol tables, each with 100, 1,000, or 10,000 live entries, closed
versions, and cached resolutions. The cutoff retains every entry, isolating
the cost of full scans that reclaim nothing between expiration deadlines.
Setup, cache population, and retention assertions are outside the timed region.
CSV rows report nanoseconds per sweep across all tables.

It measures cache/history scanning only; environment-map copying, locking,
stack dispatch, and code-event delivery are excluded. Compare repeated runs
before deciding whether to reduce maintenance frequency. It does not measure
reclamation throughput or memory retained by a slower maintenance cadence.

## Symbol cleanup

```sh
out/Release/cctest --gtest_also_run_disabled_tests \
  --gtest_filter=EBPFProfilerTest.DISABLED_V8CodeSymbolTableCleanupBenchmark
```

This benchmark measures actual eviction across the same table counts and
sizes. Each table has a live entry, a closed version, and a cached historical
resolution per address. Half the closed versions expire at timestamp 20 and
half at 30. `partial` removes half the history/cache; `full` removes all of it.

Each row averages 20 sweeps, restoring identical tables outside the timed
region before every sweep. Timings include removal and next-expiration tracking;
table copying, final destruction, setup, and retained-entry assertions are
excluded. Environment-map copying and locking are also excluded.

Both the baseline benchmark commit and the following optimization commit
include this benchmark. Build both revisions with identical Release settings
and interleave repeated runs of both binaries to compare cleanup costs.

## Symbol address reuse

```sh
out/Release/cctest --gtest_also_run_disabled_tests \
  --gtest_filter=EBPFProfilerTest.DISABLED_V8CodeSymbolTableAddressReuseBenchmark
```

This benchmark ingests 10,000 events into 100, 1,000, or 10,000 initially
disjoint code regions. Each pass alternates between two partially overlapping
starts within each region. CSV rows report nanoseconds per ingestion and final
live/history counts. There are no cached resolutions or history evictions.
History intentionally retains all closed versions; the benchmark measures
ingestion cost and live-table retention, not resident memory or GC behavior.

Setup and count assertions are outside timing. Both versions must use the
same benchmark source; its count assertion accepts either retirement policy
so it can run on the baseline. Compare interleaved runs before claiming a
performance improvement.

## Non-overlapping symbol ingestion

```sh
out/Release/cctest --gtest_also_run_disabled_tests \
  --gtest_filter=EBPFProfilerTest.DISABLED_V8CodeSymbolTableIngestionBenchmark
```

This control benchmark ingests 10,000 new disjoint ranges after creating
100, 1,000, or 10,000 initial entries. It measures ingestion overhead without
retirement or history allocation. Setup and live/history assertions are outside
timing. Use the same source in both builds and compare interleaved runs.

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

