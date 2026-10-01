# eBPF profiling review checklist

Reviewed on 2026-10-01, from `887a1c9055e04d7249f2fe277f5d83bbb9918f0c`
through `0b4de755774`. This is a temporary tracking document; remove it when
the findings are addressed. Findings are from source inspection unless noted.

## Correctness and concurrency

- [x] **1. [P1] Initialize the profiler on the NSolid thread.**
  Addressed in `8886b1b5f53` (`src: initialize the eBPF profiler on the NSolid
  thread`). `EnvList` owns a persistent profiler instance, with loop-handle
  initialization in `env_list_routine_`. Enable/disable run on the NSolid
  thread and preserve synchronous configuration results. BPF loading remains
  lazy; disable releases sampling resources, and shutdown closes loop handles
  before releasing ownership.
  The concern is concurrent loop access and the documented NSolid-thread
  restriction on ELF build-ID lookup, not construction on a different thread
  by itself. No runtime failure was reproduced.
  Added `NodeZeroIsolateTestFixture.EBPFProfilerThreadLifecycle` to cover
  instance reuse, repeated enable/disable, owning-thread configuration, and
  the persistent inactive timer. No build or tests were run; validation is
  left to the user. `git diff --check` passed before commit.

- [x] **2. [P1] Synchronize code-event access to the profiler.**
  The race was addressed by `8886b1b5f53`: configuration, code-event delivery,
  and shutdown run on the NSolid thread, and the persistent profiler pointer
  is unchanged during enable/disable. No additional pointer lock is needed
  in the code-event path.
  This follow-up adds thread-affinity assertions to `got_code_event()` and
  `EBPFProfiler::OnCodeEvent()`. The existing main/worker code-event addon test
  now enables and disables profiling and verifies continued hook delivery.
  Sampling-path coverage requires a host where BPF loading succeeds. No build
  or tests were run; `git diff --check` passed before commit.

- [x] **3. [P1] Remove the stack hook before destroying the export queue.**
  `GrpcAgent::do_stop()` now resets `stack_hook_` before `stack_queue_`,
  matching the configuration-disable path. Hook removal takes the same
  `TSList` mutex held during callback dispatch, so it waits for any running
  callback before the queue is destroyed.
  No new test was added: current test interfaces do not expose a deterministic
  way to pause the stack callback during shutdown. No build or tests were run;
  `git diff --check` passed before commit.

- [x] **4. [P1] Attach workers created after profiling is enabled.**
  `AddEnv()` now attaches new workers while profiling is enabled, after
  releasing the map lock and acquiring the profiler lock. Idempotent
  attachment (finding 6) prevents duplicate events when an enable snapshot
  also attaches the worker. `RemoveEnv()` erases the map entry before locking
  the profiler to detach, so in-flight snapshots finish before detachment
  and later snapshots cannot reattach the departing worker.
  Added `test-nsolid-ebpf-worker-attachment.js` for late-worker attachment,
  exit cleanup, disabled profiling, and enablement overlapping startup or
  exit. It counts perf-event descriptors and skips when eBPF is unavailable.
  No build or tests were run; whitespace checks passed before commit.

- [x] **5. [P1] Preserve symbol metadata across real V8 relocation events.**
  `V8CodeSymbolTable::Ingest()` copies the live source entry's metadata before
  closing it, then updates the destination address, length, and validity
  interval. Historical entries retain their metadata. Unknown sources keep
  the existing relocation fallback.
  Updated the relocation test to use `kRelocationType`, empty names/comment,
  and zero source positions, matching V8's payload. Coverage includes script
  metadata and original event type, repeated moves, historical resolution,
  cache invalidation, destination length, and unknown-source fallback.
  No build or tests were run; `git diff --check` passed before commit.

- [x] **6. [P2] Make thread attachment idempotent.**
  Addressed alongside finding 4 to allow narrower lifecycle lock scopes.
  `EBPFProfiler::AddThread()` checks for an existing TID under the descriptor
  map lock before opening a perf event, returning success without allocating
  another descriptor when already attached.
  Added `NodeZeroIsolateTestFixture.EBPFProfilerDuplicateThreadAttachment`
  to verify repeated attachment leaves the descriptor count unchanged and
  disable closes all recorded events. It skips when eBPF is unavailable.
  No build or tests were run; whitespace checks passed before commit.

- [x] **7. [P2] Initialize the ELF address output.**
  `ProcessMemoryMappings::Read()` initializes `elf_vaddr` to zero before
  calling `GetElfVaddr()`, so failed lookups no longer copy an uninitialized
  value into the mapping.
  Added `NodeZeroIsolateTestFixture.MemoryMappingWithoutElfAddress`, which
  maps an unlinked temporary file and verifies that failed ELF lookup leaves
  `has_elf_vaddr` false and `elf_vaddr` zero. The mapping read runs on the
  NSolid thread. No build or tests were run; `git diff --check` passed before
  commit.

- [ ] **8. [P2] Refresh native mappings during profiling — deferred.**
  `src/nsolid/nsolid_ebpf_profiler.cc:91` reads mappings only at initialization.
  Later-loaded addons remain unknown; unloaded mappings whose addresses are
  reused can give samples an obsolete build ID and ELF address. Introduce a
  controlled refresh strategy that considers both unknown addresses and reuse.
  Deferred at the user's request. No refresh implementation is retained; see
  the separate mapping-change detection TODO below.

- [ ] **9. [P2] Bound exports and report failures.**
  `agents/grpc/src/grpc_agent.cc:1593` ignores RPC status and the response,
  including partial rejection. Failed batches disappear without normal
  operational visibility. `MakeClientContext()` in `grpc_client.cc:83` sets
  no deadline, and outstanding exports have no explicit limit. A server that
  stalls responses can retain successive request arenas. Add deadlines,
  failure/partial-rejection reporting, and a bounded outstanding-export policy.
  Retries must account for ambiguous failures and duplicate samples.

- [ ] **10. [P2] Account for pending samples on disable and shutdown.**
  `agents/grpc/src/grpc_agent.cc:2381` discards queued, unexported samples when
  the queue is reset. Profiler destruction also discards stacks waiting for
  the 50 ms symbol-reordering window. Low-activity processes can lose their
  final batch before the 60-second flush. Drain explicitly, or expose dropped
  sample accounting if teardown intentionally discards data.

- [x] **11. [P2] Mark perf descriptors close-on-exec.**
  `EBPFProfiler::AddThread()` passes `PERF_FLAG_FD_CLOEXEC` to
  `perf_event_open()`, preventing spawned programs from retaining sampling
  descriptors across exec.
  Added `NodeZeroIsolateTestFixture.EBPFProfilerDescriptorsCloseOnExec` to
  check `FD_CLOEXEC` on newly opened perf descriptors and verify cleanup on
  disable. It skips when eBPF is unavailable. No build or tests were run;
  `git diff --check` passed before commit.

## Performance and memory

- [x] **Bound symbol lookup on cache misses.**
  `src/nsolid/v8_code_symbol_table.cc:106` starts at `upper_bound()` but can
  walk backward through the entire table. Every code event clears the cache.
  Unresolved frames during JIT churn therefore retain an O(n) worst case.
  The ordered map improves the starting point but does not bound the search.
  Added baseline benchmark:
  `EBPFProfilerTest.DISABLED_V8CodeSymbolTableLookupBenchmark` measures cached
  hits, uncached live/history hits, and unresolved gaps at increasing table
  sizes. See `benchmark/nsolid/README.md` for invocation and comparison.
  The user verified that the baseline benchmark works. Added a lookup
  bound: stop backward scans once the distance from the PC
  reaches the largest code length seen. This preserves overlapping ranges and
  older, longer versions. The bound remains conservative after eviction;
  dense ranges within that address window can still require linear scanning.
  Added regressions for overlapping live/history ranges, shortened replacement,
  eviction, exclusive end addresses, and lookups near zero. The user built
  both versions; the agent ran ten interleaved benchmark pairs with alternating
  order, all passing. At 10,000 entries, median baseline/new ns per lookup:
  cached 32.55/28.12; live 384.58/409.56; history 126,093.18/459.09;
  unknown 148,053.57/136.55. Historical and unresolved lookups improved
  approximately 275x and 1,084x. Cached/live measurements showed overlapping
  run-to-run ranges. This validates the targeted synthetic workload, not
  end-to-end profiler overhead. No build or other tests were run by the agent.

- [x] **Reduce symbol-maintenance frequency if measurement warrants it.**
  Addressed in `ff828507d2d` (`src,test: skip V8 symbol scans before expiration`).
  Each table tracks its earliest closed-version end timestamp and skips
  cache/history scans until the cutoff passes it. Closing a version updates
  the bound; eviction recomputes it. Reclamation boundaries are unchanged.
  Environment-map copying remains unchanged and was excluded from measurements.
  All 11 symbol-table regression tests passed on the user-built candidate.
  Ten interleaved no-expiration benchmark pairs passed: at 10,000 entries,
  median baseline/new sweep costs were 828,894.21/3.38 ns for one table and
  9,348,290.75/28.48 ns for eight tables.
  Ten interleaved partial/full cleanup benchmark pairs also passed. At
  10,000 entries, partial cleanup medians were 660.51/754.61 us for one table
  (+14.2%) and 7.15/7.24 ms for eight tables (+1.2%); full cleanup was
  1.12/1.12 ms (+0.5%) and 10.24/10.15 ms (-0.9%). Other cases were mixed,
  with some slower medians and overlapping run-to-run ranges. Keep the change
  for its avoided scans; actual cleanup is not claimed to be cost-free.
  These synthetic benchmarks do not establish end-to-end profiler overhead.
  No build was run by the agent.

- [x] **Retire live symbols when their address range is reused.**
  Retain live symbols until replacement or relocation, per the user's policy.
  New ranges close overlapping live entries at the event timestamp, including
  partial reuse and relocation destinations. Historical versions remain
  available to older samples until normal eviction. Adjacent ranges stay live.
  Live ranges are nonempty and disjoint: ingestion checks the predecessor and
  walks forward through overtaken starts, reuses retirement iterators, and
  inserts with a map hint. Zero-length events close an exact-start entry but
  add no empty live range. No age-based expiration, collection tracking, or
  session cleanup is introduced.
  Added regressions for partial reuse, multiple overlaps, touching endpoints,
  historical resolution, cache invalidation, relocation metadata, and empty
  ranges. These regressions have not been run by the agent.
  Both ingestion benchmarks passed in ten interleaved baseline/candidate
  pairs on user-built binaries. Median ns per ingestion for 100 / 1,000 /
  10,000 initial entries: address reuse 308.87/264.44, 415.91/437.32,
  267.54/417.44; disjoint insertion 153.44/107.35, 166.01/107.57,
  251.21/126.47. Disjoint insertion improved 30-50%. Address reuse halves
  live counts in this workload, moving replaced entries into history rather
  than immediately reducing total retained versions. At 10,000 entries the
  candidate creates 10,000 historical versions the baseline omits and costs
  56% more per ingestion. Keep this behavior for correct address attribution;
  it is not an across-the-board ingestion speedup or an RSS measurement.
  No build or other tests were run by the agent; whitespace checks passed.

- [x] **Avoid duplicate native mapping searches.**
  `ClassifyFrame()` searches mappings, then `PopulateNativeFrameInfo()` repeats
  the linear search. Reuse the result; consider ordered lookup if measurable.
  Classification returns its native mapping, and population requires it
  instead of repeating the lookup. The stack path passes the pointer from
  the same snapshot. The fallback search has been removed; only the benchmark
  reference path explicitly performs a second lookup. JIT precedence, unknown
  addresses, and failed ELF lookup remain unchanged; non-native classification
  clears the output pointer.
  Added a regression for native metadata, JIT/unknown pointer clearing, and
  missing ELF data. `DISABLED_NativeFrameMappingBenchmark` compares duplicate
  and reused lookups in one binary at growing mapping counts, including
  first/last hits, unknown addresses, and JIT ranges. No ordered index is
  introduced. Ten runs of the benchmark passed on the user-built candidate.
  Median duplicate/reuse ns per frame for 100 / 1,000 / 10,000 mappings:
  first hits 11.18/8.84, 9.68/8.59, 10.39/9.32; last hits
  237.93/108.09, 1,968.68/1,127.43, 22,936.39/10,804.73. Last hits improved
  approximately 1.75-2.20x. Unknown-address timings were broadly comparable;
  JIT timings are too small to support a performance conclusion. This is
  synthetic helper-level evidence, not end-to-end profiling overhead.
  No build or other tests were run by the agent; whitespace checks passed.
  The follow-up removing optional arguments and fallback lookup has not been
  built or measured; the preceding timings describe the initial reuse patch.

- [x] **Reserve batch storage using an actual item count.**
  The existing helper in `src/nsolid/async_ts_queue.h:196` assigns the boolean
  result of `dequeue()` to `size_t`. Its `reserve(size + 1)` reserves two slots,
  so larger batches repeatedly grow the vector. Sample delivery is correct;
  this is an existing helper inefficiency exercised by the new exporter.
  Use `dequeue(item, size)` to retrieve the
  remaining count under the queue lock, then reserve `size + 1`. The boolean
  return still controls whether a batch is delivered; concurrent arrivals
  can grow the vector normally.
  Added an async batch regression that checks FIFO contents and one move into
  the vector per item, with no reallocation moves for a stable batch. Added
  `AsyncTSQueueBatchTest.DISABLED_ReservationBenchmark` reports drain time
  and extra capacity growths. Before removing the old two-slot reference path,
  the regression and ten comparison runs passed on the user-built binary.
  Median two-slot/count-based ns per batch for sizes 1 / 64 / 256 / 4,096:
  45.80/47.14, 885.48/710.67, 3,336.84/2,819.69,
  149,845.71/84,746.43. Larger batches improved approximately 1.18-1.77x;
  singleton timings were broadly comparable. Extra capacity growths fell
  from 0 / 5 / 7 / 11 to zero in every case. Retained benchmark code now
  exercises only count-based reservation. That benchmark cleanup has not been
  rebuilt or rerun. No build was run by the agent; whitespace checks passed.

## Validation and missing coverage

The available `out/Release/cctest` passed 16 profiler/bucket tests and 16 queue
tests. The binary predates reviewed HEAD; these are supporting checks, not
validation of a fresh build. No build was performed and no code was changed.

- [ ] Exercise enable/disable and shutdown with concurrent code events.
- [ ] Verify workers created after enable are sampled and detached correctly.
- [ ] Test real-shaped relocation events with empty metadata.
- [ ] Test duplicate attachment and descriptor inheritance/cleanup.
- [ ] Test late native loading and mapping address reuse.
- [ ] Test exporter failure, partial rejection, and stalled responses.
- [ ] Decode exported OTLP requests and verify sample/value conservation,
  dictionary references, multiple threads, widely separated buckets, and
  separate flushes contributing to the same bucket.
- [ ] Test final draining on disable and shutdown.

Suggested order: address correctness findings 1-5 first, then descriptor and
export failure handling, before smaller allocation optimizations.

## Deferred TODO: eBPF mapping-change detection

- [ ] Investigate event-driven native mapping invalidation for finding 8.
  Track successful `mmap`, `munmap`, and `mremap` operations for the target
  process, including relevant `mprotect` transitions. Use a generation counter
  in a BPF map to trigger userspace refreshes without depending on potentially
  dropped ring-buffer notifications. Add explicit probe attachment and cleanup,
  and verify kernel/architecture coverage. Filter irrelevant allocator/JIT
  changes and avoid refresh-induced mapping churn. Account for queued samples
  captured before a mapping change; a current snapshot alone does not provide
  historical attribution. Cover late loading, unloading, address reuse, and
  notification loss. No implementation or validation was performed for this
  approach.
