# N|Solid Smart Logging: Current Implementation and Roadmap

## 1. Motivation
Organizations spend significant amounts of money ingesting and storing logs, while most entries represent healthy behavior that is never queried. At the same time, incident debugging needs high-fidelity logs (`debug`/`trace`) that are often disabled in production due to cost.

Smart Logging addresses this by buffering logs in runtime memory and exporting them only when diagnostically useful.

## 2. Current Implementation (Today)

### 2.1 Interception and ingestion
N|Solid captures logs from userland loggers through the existing runtime integration points (Pino/Winston interception path) and forwards them to the native log pipeline.

### 2.2 Ownership and threading model
- The smart log ring buffer is now owned by the **gRPC agent thread** (`GrpcAgent`).
- `EnvList` no longer owns or flushes the smart log buffer.
- Log writes still enter through the log hook path, then are queued to `GrpcAgent`.

### 2.3 Buffer behavior
- `GrpcAgent::got_logs()` appends log entries to a fixed-size C++ ring buffer.
- Buffer entries are overwritten in FIFO order when capacity is reached.
- This keeps memory bounded and avoids V8 GC pressure for buffered log payloads.

### 2.4 Current export behavior (known gap)
- Logs are currently exported in real time when `got_logs()` processes them.
- On shutdown (`GrpcAgent::do_stop()`), buffered logs are drained and flushed (currently via stderr crash-log output).

This means we already have the buffering substrate, but still need to tighten **when** logs are sent upstream.

## 3. Agreed Next Changes

### 3.1 Selective log delivery to Console
Move from "send every log" to "send only when needed":

1. **Crash / error-exit trigger**
   - On abnormal termination, extract buffered logs and send to Console.
2. **Manual Console trigger**
   - Add a command path to request a log-buffer dump on demand.

Normal healthy traffic should remain buffered/evicted without continuous upstream shipping.

### 3.2 New configuration: `NSOLID_LOG_BUFFER`
Add a new environment variable to control ring-buffer capacity:

- **Name:** `NSOLID_LOG_BUFFER`
- **Default:** `50M`
- **Recommended format:** `<number>[K|M|G]` (case-insensitive)
  - examples: `1048576`, `1M`, `64M`, `1G`
- **Behavior on invalid value:** fallback to default (`50M`) and emit debug warning.

This enables runtime tuning for different deployment profiles (small edge nodes vs large services).

## 4. Target Trigger Conditions
As the selective-delivery work lands, these triggers define when buffered logs should be exported:

1. **Application errors:** uncaught exception / unhandled rejection / fatal exit path.
2. **Manual intervention:** explicit command from N|Solid Console to dump buffered logs.

Future trigger types (latency/resource anomalies) remain planned and can be added incrementally.

## 5. Roadmap (Preserved Improvements)

### 5.1 Context-aware grouping (ALS)
- Use `AsyncLocalStorage` to attach an execution ID to logs.
- Group and selectively extract/discard by execution context.

### 5.2 Tail-based evaluation
- Discard buffered logs for successful requests.
- Export logs for failing/slow requests.

### 5.3 Crash durability (`mmap`) 
- Evolve ring-buffer backing to memory-mapped storage for stronger crash recovery.
- Keep cross-platform behavior consistent across Unix/macOS/Windows.

## 6. Phased Status
1. **Phase 1: Integration & interception**
   - In place.
2. **Phase 2: Global black-box buffer (GrpcAgent-owned)**
   - In place (buffering path moved to `GrpcAgent`).
3. **Phase 2.1: Selective Console delivery + command trigger + configurable size**
   - Next implementation step.
4. **Phase 3: Context-aware filtering (ALS + tail-based decisions)**
   - Planned.
