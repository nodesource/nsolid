# N|Solid Smart Logging: Context-Aware Ring Buffer

## 1. Motivation
Organizations spend massive amounts of money ingesting, indexing, and storing logs. However, upwards of 99% of these logs represent healthy system behavior and are never queried. When an incident occurs (e.g., an HTTP 500, a latency spike, or a crash), developers need high-fidelity `debug` and `trace` logs to diagnose the issue, but these are often disabled in production due to cost.

This feature introduces a runtime-level solution in N|Solid to buffer high-fidelity logs in memory and conditionally flush them only when an anomaly is detected, drastically reducing logging costs while preserving critical diagnostic data.

## 2. Core Architecture
The solution combines an efficient C++ in-memory ring buffer with Node.js `AsyncLocalStorage` (ALS) to group logs by their execution context (e.g., an HTTP request). 

### 2.1 Log Interception
- **Monkey-patching or Core Hooks:** Intercept standard streams (`process.stdout`/`process.stderr`) or hook directly into popular logging frameworks (Pino, Winston) at the `lib/` layer.
- **Serialization Bypass:** Prevent the logger from immediately stringifying or formatting the log if it is destined for the buffer, saving CPU cycles on discarded logs.

### 2.2 Context Tracking
- Use `AsyncLocalStorage` to assign a unique, lightweight execution ID to incoming requests or transactions.
- Every intercepted log is tagged with this execution ID before being pushed to the buffer.

### 2.3 The Ring Buffer (C++ Layer)
- **Memory Management:** To avoid V8 Garbage Collection pressure, logs are pushed across the C++ boundary into a fixed-size, pre-allocated ring buffer in `src/`.
- **Partitioning:** The buffer is logically partitioned or indexed by the execution ID, allowing fast retrieval or deletion of all logs associated with a specific request.

### 2.4 Tail-Based Evaluation (The Trigger)
When the execution context ends (e.g., the HTTP response is sent), N|Solid evaluates the outcome:
- **Success (e.g., HTTP 200, Latency < 500ms):** The logs associated with the execution ID are instantly discarded from the ring buffer. (Optional: keep a 1% statistical sample).
- **Failure (e.g., HTTP 5xx, Exception, Timeout):** The logs for the execution ID are extracted from the buffer, formatted, and flushed to the standard logging pipeline or the N|Solid Console.

## 3. Resilience & Safety (Memory and Crashes)
To ensure the logging mechanism does not cause out-of-memory errors or lose data during hard crashes, we employ strict safety controls.

### 3.1 Memory Controls
- **Fixed-Size Pre-allocation:** The C++ ring buffer is allocated with a strict maximum size (e.g., 50MB) at process startup. Once full, the oldest entries are overwritten, ensuring the memory footprint never grows.
- **V8 GC Pressure Relief:** Keeping the buffer in C++ hides the log strings from the V8 Garbage Collector, avoiding expensive GC pauses.
- **Per-Context Limits:** To prevent a single rogue request from flooding the buffer, a per-execution ID byte/line limit is enforced.

### 3.2 Crash Survival via Memory-Mapped Files (mmap)
To survive unexpected process terminations (e.g., C++ segfaults, OOM kills):
- **Cross-Platform `mmap`:** The C++ ring buffer is backed by a memory-mapped file on disk. This leverages OS-level virtual memory management.
- **Libuv Integration:** We use `libuv`'s built-in file mapping support (`UV_FS_O_FILEMAP` on Windows, standard POSIX `mmap` on Unix/macOS) to ensure 100% cross-platform compatibility.
- **Recovery:** If the process crashes unexpectedly, the OS guarantees the pages are written to the `mmap` file. Upon restart (or via an external N|Solid Agent), the exact "black box" logs from the moment of the crash can be recovered and transmitted.

## 4. Trigger Conditions
The decision to flush a context's logs can be wired to multiple N|Solid anomaly detectors:
1. **Application Errors:** Unhandled rejections, uncaught exceptions, or specific HTTP status codes.
2. **Performance Degradation:** Request latency exceeding a configured threshold.
3. **Resource Spikes:** Event Loop Utilization (ELU) spikes or memory threshold breaches during the request lifecycle.
4. **Manual Intervention:** A dynamic trigger from the N|Solid Console to capture the next `N` requests or dump the current global buffer.

## 5. Implementation Phases
1. **Phase 1: Global Black Box (Crash-focused)**
   - Implement the `mmap`-backed C++ ring buffer without ALS context.
   - Flush the entire buffer on `uncaughtException` or manual N|Solid Console trigger.
2. **Phase 2: Context-Aware Filtering (Request-focused)**
   - Integrate ALS context tracking.
   - Implement tail-based evaluation (discard on success, flush on failure).
3. **Phase 3: Integration & Ecosystem**
   - Direct plugins for Pino/Winston.
   - Configuration UI in the N|Solid Console.
