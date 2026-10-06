# N|Solid: multiple environments per isolate assessment

Assessment date: 2026-10-06.
Baseline: current `nsolid-v26` working tree, based on Node.js v26.10.0.

## Summary

N|Solid already has substantial per-environment state, but several paths still
assume one environment equals one isolate equals one event loop. Full support
requires separating these ownership levels.

This assessment covers runtime state, bindings, profilers, tracing, metrics,
and agents. It distinguishes source-confirmed defects from lifecycle risks
that need targeted reproduction. No additional implementation changes were
made during the assessment.

The existing environment/N-API tests were run: 37 passed. That establishes
basic coexistence, not full N|Solid feature support.

## Environment identity: correction to the initial concern

Normal registration does not collide simply because environments share an
isolate. Node allocates a unique logical `thread_id` per environment by default.
These IDs are not OS-thread identities.

Sources:

- `src/env.cc`: environment construction and `thread_id_` initialization.
- `src/api/environment.cc`: `AllocateEnvironmentThreadId()`.

The existing environment map can remain. Explicitly reused IDs should be
rejected rather than silently ignored by `emplace`.

## Required fixes

### 1. Interrupts must target the requesting environment

Priority: critical. Source-confirmed routing defect.

`EnvInst::RunCommand()` queues work on a specific `EnvInst`, but requests a V8
interrupt with `nullptr` data. Interrupt delivery then chooses the queue using
the currently entered environment.

If A requests work while B executes:

- `InterruptOnly` can leave A's work queued indefinitely.
- `Interrupt` has an event-loop fallback, but that cannot provide timely
  execution while B blocks the isolate.
- Tracing/configuration updates, promise tracking, profiling, and blocked-loop
  reporting inherit this problem.

Required fix: preserve target identity through an isolate-level pending-command
dispatcher. Its lifetime must remain valid even if an environment disappears
before the interrupt arrives. Passing an unprotected raw `EnvInst*` would
introduce a teardown race.

Source: `src/nsolid/nsolid_api.cc`, `EnvInst::RunCommand()`,
`run_interrupt_()`, and `run_interrupt_only_()`.

### 2. Span identity and cleanup are not environment-safe

Priority: critical. Source-confirmed defects; duplicate ID allocation verified
at runtime.

Each environment's internal span counter starts independently. The process-wide
pending-span map keys only on that counter.

A runtime check confirmed that the main environment and a Worker both produce
internal span ID `1`. Overlapping spans can mix attributes or finish the wrong
span. This already affects Workers, not just shared-isolate embeddings.

Additionally, removing any main-thread environment invokes process-wide span
termination: `EnvList::RemoveEnv()` calls `TracerImpl::endPendingSpans()`, which
clears every pending span.

Required fixes:

- Key pending spans by `(environment ID, internal span ID)`.
- End only the departing environment's spans.
- Reserve "end everything" for actual process shutdown.

Sources:

- `lib/internal/otel/utils.js`: `newInternalSpanId()`.
- `src/nsolid/nsolid_trace.cc`: `addSpanItem()` and `endPendingSpans()`.
- `src/nsolid/nsolid_api.cc`: `EnvList::RemoveEnv()`.

### 3. Heap profiling needs isolate-wide exclusivity

Priority: critical. Source-confirmed ownership mismatch.

Heap sampling, allocation tracking, and snapshot requests are guarded by
environment ID, but operate on the isolate's shared `HeapProfiler`.

Two environments can therefore pass N|Solid's exclusivity checks while
manipulating the same profiler. The sampling start path also ignores V8's
failure return when sampling is already active.

Required fixes:

- Track profiler reservations by isolate, with the requesting environment
  recorded separately.
- Reject conflicting requests and check V8's return value.
- Ensure cancellation/teardown releases only the owning request.
- Identify results as isolate-wide: heap snapshots are not environment-local
  heaps.

Sources:

- `src/nsolid/nsolid_heap_snapshot.cc`: sampling, tracking, snapshot maps,
  and calls to `isolate->GetHeapProfiler()`.
- `deps/v8/include/v8-profiler.h`: `StartSamplingHeapProfiler()` returns false
  if a sampling heap profiler is already running.

### 4. Deferred callbacks and exposed buffers need lifetime protection

Priority: critical risk. Unsafe ownership patterns identified by source review;
targeted teardown reproduction remains necessary.

Two patterns require dedicated tests:

- The loader timer stores a raw `Environment*`, but its cleanup callback does
  not cancel the timer. With delayed initialization, an environment could
  disappear while its shared loop survives.
- Exported ArrayBuffers reference `EnvInst` memory with no-op backing-store
  deleters. A reference retained by another context can outlive the originating
  environment and its storage.

Required fixes: cancel environment-owned timers during cleanup; make backing
memory independently owned or retain it through backing-store ownership. Also
audit queued profile callbacks and persistent JS handles for the case
"environment gone, isolate still alive."

Source: `src/nsolid/nsolid_api.cc`, `RunStartInTimeout()`,
`close_nsolid_loader()`, `run_nsolid_loader()`, `SetupArrayBufferExports()`,
and profile callback paths.

### 5. Main environment must become an explicit role

Priority: high. Source-confirmed inconsistent ownership rules.

`Environment::is_main_thread()` means "not a Worker." Multiple embedded
environments can all satisfy it.

Consequences:

- `EnvList::AddEnv()` repeatedly replaces `main_thread_id_`; removal provides
  no replacement policy.
- Every non-Worker environment can run N|Solid startup, overwriting shared
  configuration and process information.
- StatsD and parts of ZMQ/gRPC instead assume literal ID `0`.

Required fix: designate a process-agent owner explicitly, respecting Node's
process-ownership flags and the embedding contract. Replace hard-coded zero
checks and define what happens when that owner exits.

Keeping one process-wide agent is reasonable. Allowing each environment to
represent a separate application would require a broader agent/backend model.

Sources:

- `src/env-inl.h`: `is_main_thread()` and `owns_process_state()`.
- `src/nsolid/nsolid_api.cc`: `AddEnv()`, `RemoveEnv()`, and `DoExit()`.
- `lib/nsolid.js`: `start()` and `genInfoObject()`.
- `agents/statsd/src/binding.cc`: `InitStatsDAgent()`.
- `agents/statsd/src/statsd_agent.cc`: `env_deletion_cb()`.
- `agents/zmq/src/zmq_agent.cc`: `env_deletion_cb()` and main-profile handling.
- `agents/grpc/src/grpc_agent.cc`: `got_profile()` main-profile handling.

### 6. Metrics must distinguish environment, isolate, and loop

Priority: high. Source-confirmed attribution and duplication issues.

| Measurement | Actual scope | Current treatment |
| --- | --- | --- |
| HTTP/DNS/promise/handle counters | Environment | Mostly correctly environment-local |
| Heap statistics and GC | Isolate | Repeated under each environment |
| Utilization, active requests/handles, blocked loop | Event loop | Repeated under each environment |

Heap collection returns the same isolate heap for sibling environments. GC
callbacks are registered separately for each environment, so one collection
generates multiple environment-labelled records. Loop metrics likewise read
shared-loop totals.

This is primarily attribution/double-counting, not proof of memory corruption.

Required fix: collect shared resources once and expose their scope explicitly.
Preserve existing environment-level counters. Update exporters so shared
heap/GC/loop values are not presented as independent quantities that can safely
be summed.

Sources:

- `src/nsolid/nsolid_api.cc`: `GetThreadMetrics()`, `get_heap_stats_()`,
  `get_event_loop_stats_()`, GC callback registration and handlers.
- `agents/otlp/src/otlp_common.cc`: `fill_env_metrics()`.
- Agent-specific metrics exporters under `agents/otlp/src/`.

### 7. Blocked-loop reporting needs correct attribution

Priority: high. Source-confirmed attribution mismatch.

Blocked-loop detection scans environments independently. Siblings sharing a
loop can all be reported blocked, while stack collection observes whichever
environment is executing.

Required fix: detect blockage once per loop; distinguish the affected loop
from the environment currently executing the blocking stack. Entering the
requested context would not make that stack belong to the requester.

Source: `src/nsolid/nsolid_api.cc`, `blocked_loop_timer_cb_()`,
`get_blocked_loop_body_()`, and `EnvInst::GetOnBlockedBody()`.

### 8. CPU profiling needs a scope policy

Priority: high. Source-confirmed unfiltered isolate profiling;
shared-isolate cleanup needs targeted tests.

CPU profiling creates an unfiltered isolate profiler per environment. Profiles
requested for A can contain B's execution. Continuous profiling can duplicate
collection for the same isolate.

Choose one policy:

- Isolate-wide profiles, collected once and labelled accordingly.
- Environment-filtered profiles using V8's existing context filter, with
  documented limitations.

Source lookup must follow that choice: an isolate-wide profile can include
scripts absent from the requesting environment's source registry.

There is also a cleanup issue worth fixing: environment removal erases registry
membership before profiling cleanup, while the profiler-storage destructor
relies on that membership to dispose resources.

Sources:

- `src/nsolid/nsolid_cpu_profiler.cc`: `run_cpuprofiler_()`,
  `StopProfilingSync()`, and `CpuProfilerStor::~CpuProfilerStor()`.
- `src/nsolid/continuous_profiler.cc`: per-environment scheduling.
- `src/nsolid/nsolid_api.cc`: `RemoveEnv()` and source-code storage.
- `deps/v8/include/v8-profiler.h`: `CpuProfilingOptions::filter_context`.

### 9. New environments must inherit current configuration

Priority: medium. Source-confirmed initialization gap.

Promise-tracking initialization applies existing configuration only to Workers.
A later-created non-Worker environment can miss an already-enabled setting;
`UpdateConfig()` only broadcasts when configuration changes.

Required fix: initialize every new environment's local instrumentation from
current process configuration, independently of whether it owns the agent.

Sources:

- `lib/internal/nsolid_promise_tracking.js`: `init()`.
- `src/nsolid/nsolid_api.cc`: `UpdateConfig()` and `PromiseTracking()`.

## What can remain

There is no need to rewrite everything:

- `Environment::envinst_` already provides per-environment ownership.
- Fast binding paths commonly use their owning `BindingData`.
- HTTP/DNS/handle counters are largely environment-local.
- Promise hooks are installed on the environment's contexts, not
  indiscriminately across the isolate.
- Several JS callback paths already enter their owning context correctly.

These are why removing the loader callback's current-environment assertion was
valid, despite broader support being incomplete: the callback carries its
owning environment and enters its context before executing JavaScript.

## Recommended ownership model

| Owner | State/resources |
| --- | --- |
| Process | Agent identity, shared configuration, exporter connections, actual process shutdown |
| Environment | Local counters, JS callbacks, module/source records, pending commands, local spans |
| Isolate | V8 heap profiler reservations, GC/heap collection, interrupt dispatch, CPU-profile policy |
| Event loop | Utilization, loop totals, blocked-loop detection |

Keep logical environment IDs distinct from OS-thread, isolate, and loop
identity. Existing wire fields can be preserved for compatibility, but shared
resource scope must be made explicit.

## Recommended implementation order

1. Interrupt routing, span identity, and timer/buffer lifetimes.
2. Isolate-wide profiler ownership and cleanup.
3. Explicit process-agent owner.
4. Metrics scope and blocked-loop attribution.
5. Configuration inheritance and exporter compatibility.

## Regression coverage required

Create environments A and B on one isolate and exercise:

- Distinct environment IDs and correct environment-local counters.
- Execution in B while interrupt commands target A, including a blocked loop.
- Configuration changes delivered to both environments.
- Overlapping spans with identical internal IDs and independent completion.
- Removal of one environment while the other's spans remain pending.
- Conflicting heap sampling/tracking requests and explicit failure handling.
- CPU profiling under the selected isolate-wide or context-filtered policy.
- GC and shared-loop metrics without misleading duplication.
- Destruction of either environment first, followed by continued use of the
  survivor.
- Delayed startup and destruction before the loader timer fires.
- Retained ArrayBuffers and persistent callbacks across environment teardown.
- New environments inheriting already-enabled promise tracking and tracing.
- Process-agent owner removal and recreation, without assumptions about ID 0.
- Both snapshot and non-snapshot startup.

Run lifetime cases under ASan and a debug build. Existing environment/N-API
tests do not exercise these N|Solid feature interactions.

## Validation performed

Command:

```sh
out/Release/cctest --gtest_filter='NodeApiTest.*:EnvironmentTest.*'
```

Result: 37 tests passed, including `AsyncCallbacksEnterOwnContext`.

A separate runtime check confirmed independent internal span counters:

```json
{"mainInternalSpanId":1,"workerInternalSpanId":1}
```

No dedicated shared-isolate N|Solid feature harness or sanitizer run was
performed for this assessment. The proposed lifecycle failures remain risks
to reproduce, not claims of observed crashes.

## Conclusion

Passing `cctest` establishes basic coexistence, not full N|Solid support.
The necessary change is explicit resource ownership, not removing more
assertions.
