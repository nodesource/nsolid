#ifndef SRC_NSOLID_H_
#define SRC_NSOLID_H_

#include "node.h"
#include "uv.h"
#include "v8-profiler.h"

#include <memory>
#include <string>

/**
 * @file nsolid.h
 * N|Solid C++ API header file
 *
 */

/**
 * @brief node namespace
 *
 */
namespace node {
/**
 * @brief nsolid namespace
 *
 */
namespace nsolid {

class EnvInst;
struct LogWriteInfo;

#define kNSByte "byte"
#define kNSMhz "MHz"
#define kNSMSecs "ms"
#define kNSSecs "s"
#define kNSUSecs "us"
#define kNSNoUnit ""

#define NSOLID_PROCESS_METRICS_STRINGS(V)                                      \
  V(std::string, title, title, EOther, kNSNoUnit)                              \
  V(std::string, user, user, EOther, kNSNoUnit)

#define NSOLID_PROCESS_METRICS_UINT64_FIRST(V)                                 \
  V(uint64_t, timestamp, timestamp, ECounter, kNSMSecs)

#define NSOLID_PROCESS_METRICS_UINT64(V)                                       \
  V(uint64_t, uptime, uptime, ECounter, kNSSecs)                               \
  V(uint64_t, system_uptime, systemUptime, ECounter, kNSSecs)                  \
  V(uint64_t, free_mem, freeMem, EGauge, kNSByte)                              \
  V(uint64_t, block_input_op_count, blockInputOpCount, ECounter, kNSNoUnit)    \
  V(uint64_t, block_output_op_count, blockOutputOpCount, ECounter, kNSNoUnit)  \
  V(uint64_t, ctx_switch_involuntary_count,                                    \
              ctxSwitchInvoluntaryCount,                                       \
              ECounter,                                                        \
              kNSNoUnit)                                                       \
  V(uint64_t, ctx_switch_voluntary_count,                                      \
              ctxSwitchVoluntaryCount,                                         \
              ECounter,                                                        \
              kNSNoUnit)                                                       \
  V(uint64_t, ipc_received_count, ipcReceivedCount, ECounter, kNSNoUnit)       \
  V(uint64_t, ipc_sent_count, ipcSentCount, ECounter, kNSNoUnit)               \
  V(uint64_t, page_fault_hard_count, pageFaultHardCount, ECounter, kNSNoUnit)  \
  V(uint64_t, page_fault_soft_count, pageFaultSoftCount, ECounter, kNSNoUnit)  \
  V(uint64_t, signal_count, signalCount, ECounter, kNSNoUnit)                  \
  V(uint64_t, swap_count, swapCount, ECounter, kNSNoUnit)                      \
  V(uint64_t, rss, rss, EGauge, kNSByte)

#define NSOLID_PROCESS_METRICS_DOUBLE(V)                                       \
  V(double, load_1m, load1m, EGauge, kNSNoUnit)                                \
  V(double, load_5m, load5m, EGauge, kNSNoUnit)                                \
  V(double, load_15m, load15m, EGauge, kNSNoUnit)                              \
  V(double, cpu_user_percent, cpuUserPercent, EGauge, kNSNoUnit)               \
  V(double, cpu_system_percent, cpuSystemPercent, EGauge, kNSNoUnit)           \
  V(double, cpu_percent, cpuPercent, EGauge, kNSNoUnit)

#define NSOLID_PROCESS_METRICS_NUMBERS(V)                                      \
  NSOLID_PROCESS_METRICS_UINT64_FIRST(V)                                       \
  NSOLID_PROCESS_METRICS_UINT64(V)                                             \
  NSOLID_PROCESS_METRICS_DOUBLE(V)

#define NSOLID_PROCESS_METRICS(V)                                              \
  NSOLID_PROCESS_METRICS_STRINGS(V)                                            \
  NSOLID_PROCESS_METRICS_NUMBERS(V)

#define NSOLID_ENV_METRICS_STRINGS(V)                                          \
  V(std::string, thread_name, threadName, EOther, kNSNoUnit)

#define NSOLID_ENV_METRICS_UINT64_FIRST(V)                                     \
  V(uint64_t, thread_id, threadId, EOther, kNSNoUnit)

#define NSOLID_ENV_METRICS_UINT64(V)                                           \
  V(uint64_t, timestamp, timestamp, ECounter, kNSMSecs)                        \
  V(uint64_t, active_handles, activeHandles, EGauge, kNSNoUnit)                \
  V(uint64_t, active_requests, activeRequests, EGauge, kNSNoUnit)              \
  V(uint64_t, total_heap_size, heapTotal, EGauge, kNSByte)                     \
  V(uint64_t,                                                                  \
    total_heap_size_executable,                                                \
    totalHeapSizeExecutable,                                                   \
    EGauge,                                                                    \
    kNSByte)                                                                   \
  V(uint64_t, total_physical_size, totalPhysicalSize, EGauge, kNSByte)         \
  V(uint64_t, total_available_size, totalAvailableSize, EGauge, kNSByte)       \
  V(uint64_t, used_heap_size, heapUsed, EGauge, kNSByte)                       \
  V(uint64_t, heap_size_limit, heapSizeLimit, EGauge, kNSByte)                 \
  V(uint64_t, malloced_memory, mallocedMemory, EGauge, kNSByte)                \
  V(uint64_t, external_memory, externalMem, EGauge, kNSByte)                   \
  V(uint64_t, peak_malloced_memory, peakMallocedMemory, EGauge, kNSByte)       \
  V(uint64_t,                                                                  \
    number_of_native_contexts,                                                 \
    numberOfNativeContexts,                                                    \
    EGauge,                                                                    \
    kNSNoUnit)                                                                 \
  V(uint64_t,                                                                  \
    number_of_detached_contexts,                                               \
    numberOfDetachedContexts,                                                  \
    EGauge,                                                                    \
    kNSNoUnit)                                                                 \
  V(uint64_t, gc_count, gcCount, ECounter, kNSNoUnit)                          \
  V(uint64_t, gc_forced_count, gcForcedCount, ECounter, kNSNoUnit)             \
  V(uint64_t, gc_full_count, gcFullCount, ECounter, kNSNoUnit)                 \
  V(uint64_t, gc_major_count, gcMajorCount, ECounter, kNSNoUnit)               \
  V(uint64_t, dns_count, dnsCount, ECounter, kNSNoUnit)                        \
  V(uint64_t,                                                                  \
    http_client_abort_count,                                                   \
    httpClientAbortCount,                                                      \
    ECounter,                                                                  \
    kNSNoUnit)                                                                 \
  V(uint64_t, http_client_count, httpClientCount, ECounter, kNSNoUnit)         \
  V(uint64_t,                                                                  \
    http_server_abort_count,                                                   \
    httpServerAbortCount,                                                      \
    ECounter,                                                                  \
    kNSNoUnit)                                                                 \
  V(uint64_t, http_server_count, httpServerCount, ECounter, kNSNoUnit)         \
  V(uint64_t, loop_idle_time, loopIdleTime, EGauge, kNSMSecs)                  \
  V(uint64_t, loop_iterations, loopIterations, ECounter, kNSNoUnit)            \
  V(uint64_t, loop_iter_with_events, loopIterWithEvents, ECounter, kNSNoUnit)  \
  V(uint64_t, events_processed, eventsProcessed, ECounter, kNSNoUnit)          \
  V(uint64_t, events_waiting, eventsWaiting, EGauge, kNSNoUnit)                \
  V(uint64_t, provider_delay, providerDelay, EGauge, kNSMSecs)                 \
  V(uint64_t, processing_delay, processingDelay, EGauge, kNSMSecs)             \
  V(uint64_t, loop_total_count, loopTotalCount, ECounter, kNSNoUnit)           \
  V(uint64_t,                                                                  \
    pipe_server_created_count,                                                 \
    pipeServerCreatedCount,                                                    \
    ECounter,                                                                  \
    kNSNoUnit)                                                                 \
  V(uint64_t,                                                                  \
    pipe_server_destroyed_count,                                               \
    pipeServerDestroyedCount,                                                  \
    ECounter,                                                                  \
    kNSNoUnit)                                                                 \
  V(uint64_t,                                                                  \
    pipe_socket_created_count,                                                 \
    pipeSocketCreatedCount,                                                    \
    ECounter,                                                                  \
    kNSNoUnit)                                                                 \
  V(uint64_t,                                                                  \
    pipe_socket_destroyed_count,                                               \
    pipeSocketDestroyedCount,                                                  \
    ECounter,                                                                  \
    kNSNoUnit)                                                                 \
  V(uint64_t,                                                                  \
    tcp_server_created_count,                                                  \
    tcpServerCreatedCount,                                                     \
    ECounter,                                                                  \
    kNSNoUnit)                                                                 \
  V(uint64_t,                                                                  \
    tcp_server_destroyed_count,                                                \
    tcpServerDestroyedCount,                                                   \
    ECounter,                                                                  \
    kNSNoUnit)                                                                 \
  V(uint64_t,                                                                  \
    tcp_client_created_count,                                                  \
    tcpSocketCreatedCount,                                                     \
    ECounter,                                                                  \
    kNSNoUnit)                                                                 \
  V(uint64_t,                                                                  \
    tcp_client_destroyed_count,                                                \
    tcpSocketDestroyedCount,                                                   \
    ECounter,                                                                  \
    kNSNoUnit)                                                                 \
  V(uint64_t,                                                                  \
    udp_socket_created_count,                                                  \
    udpSocketCreatedCount,                                                     \
    ECounter,                                                                  \
    kNSNoUnit)                                                                 \
  V(uint64_t,                                                                  \
    udp_socket_destroyed_count,                                                \
    udpSocketDestroyedCount,                                                   \
    ECounter,                                                                  \
    kNSNoUnit)                                                                 \
  V(uint64_t, promise_created_count, promiseCreatedCount, ECounter, kNSNoUnit) \
  V(uint64_t,                                                                  \
    promise_resolved_count,                                                    \
    promiseResolvedCount,                                                      \
    ECounter,                                                                  \
    kNSNoUnit)                                                                 \
  V(uint64_t, fs_handles_opened, fsHandlesOpenedCount, ECounter, kNSNoUnit)    \
  V(uint64_t, fs_handles_closed, fsHandlesClosedCount, ECounter, kNSNoUnit)

#define NSOLID_ENV_METRICS_DOUBLE(V)                                           \
  V(double, gc_dur_us99_ptile, gcDurUs99Ptile, ESeries, kNSUSecs)              \
  V(double, gc_dur_us_median, gcDurUsMedian, ESeries, kNSUSecs)                \
  V(double, dns99_ptile, dns99Ptile, ESeries, kNSMSecs)                        \
  V(double, dns_median, dnsMedian, ESeries, kNSMSecs)                          \
  V(double, http_client99_ptile, httpClient99Ptile, ESeries, kNSMSecs)         \
  V(double, http_client_median, httpClientMedian, ESeries, kNSMSecs)           \
  V(double, http_server99_ptile, httpServer99Ptile, ESeries, kNSMSecs)         \
  V(double, http_server_median, httpServerMedian, ESeries, kNSMSecs)           \
  V(double, loop_utilization, loopUtilization, EGauge, kNSNoUnit)              \
  V(double, res_5s, res5s, EGauge, kNSNoUnit)                                  \
  V(double, res_1m, res1m, EGauge, kNSNoUnit)                                  \
  V(double, res_5m, res5m, EGauge, kNSNoUnit)                                  \
  V(double, res_15m, res15m, EGauge, kNSNoUnit)                                \
  V(double, loop_avg_tasks, loopAvgTasks, EGauge, kNSNoUnit)                   \
  V(double, loop_estimated_lag, loopEstimatedLag, EGauge, kNSMSecs)            \
  V(double, loop_idle_percent, loopIdlePercent, EGauge, kNSNoUnit)

#define NSOLID_ENV_METRICS_NUMBERS(V)                                          \
  NSOLID_ENV_METRICS_UINT64_FIRST(V)                                           \
  NSOLID_ENV_METRICS_UINT64(V)                                                 \
  NSOLID_ENV_METRICS_DOUBLE(V)

#define NSOLID_ENV_METRICS(V)                                                  \
  NSOLID_ENV_METRICS_STRINGS(V)                                                \
  NSOLID_ENV_METRICS_NUMBERS(V)

#define NSOLID_ERRORS(V)                                                       \
  V(SUCCESS, 0, "Success")

#define NSOLID_SPAN_TYPES(V)                                                   \
  V(kSpanDns, 1 << 0, dns)                                                     \
  V(kSpanGc, 1 << 1, gc)                                                       \
  V(kSpanHttpClient, 1 << 2, http_client)                                      \
  V(kSpanHttpServer, 1 << 3, http_server)                                      \
  V(kSpanCustom, 1 << 4, custom)                                               \
  V(kSpanNone, 0, None)

#define NSOLID_SPAN_END_REASONS(V)                                             \
  V(kSpanEndOk)                                                                \
  V(kSpanEndError)                                                             \
  V(kSpanEndTimeout)                                                           \
  V(kSpanEndExit)                                                              \
  V(kSpanEndExpired)

/**
 * @brief List of errors returned by N|Solid C++ API
 */
enum NSolidErr {
#define V(Type, Value, Msg)                                                    \
  NSOLID_E_##Type = Value,
  NSOLID_ERRORS(V)
#undef V
#define X(Type, Msg)                                                           \
  NSOLID_E_UV_ ## Type = UV_ ## Type,
  UV_ERRNO_MAP(X)
#undef X
};

class ThreadMetrics;
enum class CommandType;


using SharedEnvInst = std::shared_ptr<EnvInst>;
using SharedThreadMetrics = std::shared_ptr<ThreadMetrics>;
using ns_error_tp = std::tuple<std::string, std::string>;

/** @cond DONT_DOCUMENT */
namespace internal {

using queue_callback_proxy_sig = void(*)(void*);
using run_command_proxy_sig = void(*)(SharedEnvInst, void*);
using custom_command_proxy_sig = void(*)(std::string,
                                         std::string,
                                         int,
                                         std::pair<bool, std::string>,
                                         std::pair<bool, std::string>,
                                         void*);
using on_block_loop_hook_proxy_sig = void(*)(SharedEnvInst,
                                             std::string,
                                             void*);
using on_unblock_loop_hook_proxy_sig = on_block_loop_hook_proxy_sig;
using on_configuration_hook_proxy_sig = void(*)(std::string, void*);
using on_log_write_hook_proxy_sig = void(*)(SharedEnvInst, LogWriteInfo, void*);
using at_exit_hook_proxy_sig = void(*)(bool, bool, void*);
using thread_added_hook_proxy_sig = void(*)(SharedEnvInst, void*);
using thread_removed_hook_proxy_sig = thread_added_hook_proxy_sig;
using deleter_sig = void(*)(void*);
using user_data = std::unique_ptr<void, deleter_sig>;

template <typename G>
void queue_callback_proxy_(void*);
template <typename G>
void run_command_proxy_(SharedEnvInst, void*);
template <typename G>
void custom_command_proxy_(std::string,
                           std::string,
                           int,
                           std::pair<bool, std::string>,
                           std::pair<bool, std::string>,
                           void*);
template <typename G>
void at_exit_hook_proxy_(bool, bool, void*);
template <typename G>
void on_block_loop_hook_proxy_(SharedEnvInst, std::string, void*);
template <typename G>
void on_unblock_loop_hook_proxy_(SharedEnvInst, std::string, void*);
template <typename G>
void on_configuration_hook_proxy_(std::string, void*);
template <typename G>
void on_log_write_hook_proxy_(SharedEnvInst, LogWriteInfo, void*);
template <typename G>
void thread_added_hook_proxy_(SharedEnvInst, void* data);
template <typename G>
void thread_removed_hook_proxy_(SharedEnvInst, void* data);
template <typename G>
void delete_proxy_(void* g);


NODE_EXTERN int queue_callback_(void*, queue_callback_proxy_sig);
NODE_EXTERN int queue_callback_(uint64_t, void*, queue_callback_proxy_sig);
NODE_EXTERN int run_command_(SharedEnvInst,
                             CommandType, void*,
                             run_command_proxy_sig);
NODE_EXTERN int custom_command_(SharedEnvInst,
                                std::string,
                                std::string,
                                std::string,
                                void*,
                                custom_command_proxy_sig);
NODE_EXTERN int at_exit_hook_(void*, at_exit_hook_proxy_sig, deleter_sig);
NODE_EXTERN void on_block_loop_hook_(uint64_t,
                                     void*,
                                     on_block_loop_hook_proxy_sig,
                                     deleter_sig);
NODE_EXTERN void on_unblock_loop_hook_(void*,
                                       on_unblock_loop_hook_proxy_sig,
                                       deleter_sig);
NODE_EXTERN void on_configuration_hook_(void*,
                                        on_configuration_hook_proxy_sig,
                                        deleter_sig);
NODE_EXTERN void on_log_write_hook_(void*,
                                    on_log_write_hook_proxy_sig,
                                    deleter_sig);
NODE_EXTERN void thread_added_hook_(void*,
                                    thread_added_hook_proxy_sig,
                                    deleter_sig);
NODE_EXTERN void thread_removed_hook_(void*,
                                      thread_removed_hook_proxy_sig,
                                      deleter_sig);

}  // namespace internal

/** @endcond */


/**
 * @brief Retrieve the EnvInst for a specific thread id. Make sure to check
 * that the return value isn't nullptr. If the SharedEnvInst isn't cleaned
 * up then memory will leak. Make sure to clean up any references to the
 * shared_ptr no later than in the ThreadRemovedHook(). This call is
 * thread-safe.
 *
 */
NODE_EXTERN SharedEnvInst GetEnvInst(uint64_t thread_id);

/**
 * @brief Call cb synchronously with each existing SharedEnvInst instance
 * currently alive. This call is thread-safe.
 */
NODE_EXTERN void GetAllEnvInst(std::function<void(SharedEnvInst)>);

/**
 * @brief Retrieve the SharedEnvInst for the current v8::Context. Must be
 * run from a valid Isolate. This call is not thread-safe.
 *
 */
NODE_EXTERN SharedEnvInst GetLocalEnvInst(v8::Local<v8::Context> context);
/**
 * @brief Retrieve the SharedEnvInst for the current v8::Isolate. Must be
 * run from a valid Isolate. This call is not thread-safe.
 *
 */
NODE_EXTERN SharedEnvInst GetLocalEnvInst(v8::Isolate* isolate);

/**
 * @brief Retrieve the EnvInst for the main thread.
 */
NODE_EXTERN SharedEnvInst GetMainEnvInst();

/**
 * @brief Returns the thread_id for a given EnvInst instance. If there's an
 * error then UINT64_MAX will be returned. The only reason this call can fail
 * is if the SharedEnvInst is invalid.
 *
 */
NODE_EXTERN uint64_t GetThreadId(SharedEnvInst envinst_sp);
/**
 * @brief returns the thread id from a specific v8::Context. This should return
 * the same value as GetThreadId(GetLocalEnvInst(context)).
 *
 * @param context
 * @return thread_id
 */
NODE_EXTERN uint64_t ThreadId(v8::Local<v8::Context> context);

/**
 * @brief Returns whether the current thread is the same thread that created
 * the EnvInst instance. This call is thread-safe.
 *
 */
NODE_EXTERN bool IsEnvInstCreationThread(SharedEnvInst envinst);

/**
 * @brief Returns whether the EnvInst instance thread corresponds with the main
 * thread.
 *
 */
NODE_EXTERN bool IsMainThread(SharedEnvInst envinst);

/**
 * @brief Return JSON of the startup times for a given EnvInst instance.
 *
 */
NODE_EXTERN int GetStartupTimes(SharedEnvInst envinst_sp, std::string* times);

/**
 * @brief Return a tuple with the error and message of why the process is
 * shutting down.
 *
 */
NODE_EXTERN ns_error_tp* GetExitError();

/**
 * @brief Return the exit code the process is about to exit with.
 *
 */
NODE_EXTERN int GetExitCode();

/**
 * @brief Return a string of the general process info. Such as arch or platform.
 *
 */
NODE_EXTERN std::string GetProcessInfo();

/**
 * @brief Return a string of the unique agent id for this NSolid instance.
 *
 */
NODE_EXTERN std::string GetAgentId();

/**
 * @brief Update the current global config object used for configuring various
 * parts of NSolid. The string is JSON that is deep copied in and only updates
 * fields that are contained.
 *
 */
NODE_EXTERN void UpdateConfig(const std::string& config);

/**
 * @brief Return a JSON string of the current config.
 *
 */
NODE_EXTERN std::string GetConfig();

/**
 * @brief to retrieve the list of packages used by the process
 *
 * @param envinst SharedEnvInst of the thread to take the info from.
 * @param json the list of packages in json format.
 * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
 * error value otherwise.
 */
NODE_EXTERN int ModuleInfo(SharedEnvInst envinst, std::string* json);

/**
 * @brief Queue a callback to be run from the NSolid thread. This call is
 * thread-safe.
 *
 */
template <typename Cb, typename... Data>
NODE_EXTERN int QueueCallback(Cb&& cb, Data&&... data);
/**
 * @brief Queue a callback to be run from the NSolid thread after timeout (ms)
 * has passed. This call is thread-safe.
 *
 */
template <typename Cb, typename... Data>
NODE_EXTERN int QueueCallback(uint64_t timeout, Cb&& cb, Data&&... data);

/**
 * @brief The three types of commands that can be run from an Environment's
 * thread:
 *
 * EventLoop  - Place command in normal event loop execution of the event loop
 *              of the Environment matching the thread_id.
 * Interrupt  - Interrupt execution of the thread that's running the Env of
 *              the matching thread_id using both RequestInterrupt in case
 *              thethread is running JS, and an async handle in case it's
 *              idle.
 * InterruptOnly - Run the command only using RequestInterrupt() and not
 *                 calling the callback until the stack has been entered.
 *
 */
enum class CommandType { EventLoop, Interrupt, InterruptOnly };
/**
 * @brief Run a callback from a given Environment's thread using one of the
 * CommandTypes. This call is thread-safe.
 * @param envinst SharedEnvInst of the thread to run the callback in.
 * @param type type of command to run.
 * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
 * error value otherwise.
 *
 */
template <typename Cb, typename... Data>
NODE_EXTERN int RunCommand(SharedEnvInst envinst,
                           CommandType type,
                           Cb&& cb,
                           Data&&... data);

/**
 * @brief Run a custom JS command that has been registered with the NSolid JS
 * API. The callback runs after completion of the JS command on the NSolid
 * thread with the results of the command.
 *
 * @param envinst SharedEnvInst of the thread run the command in.
 * @param req_id
 * @param command
 * @param args
 * @param cb hook function with the following signature:
 * `cb(std::string req_id,
 *     std::string command,
 *     int status,
 *     std::pair<bool, std::string> error,
 *     std::pair<bool, std::string> value,
 *     ...Data)`
 * @param data variable number of arguments to be propagated to the callback.
 * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
 * error value otherwise.
 *
 */
template <typename Cb, typename... Data>
NODE_EXTERN int CustomCommand(SharedEnvInst envinst,
                              std::string req_id,
                              std::string command,
                              std::string args,
                              Cb&& cb,
                              Data&&... data);

/**
 * @brief Call the callback when the process begins shutting down. It will
 * indicate whether the process is being brought down normally or from a
 * signal.
 * @param cb hook function with the following signature:
 * `cb(bool on_signal, bool profile_stopped, ...Data)`
 * @param data variable number of arguments to be propagated to the callback.
 * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
 * error value otherwise.
 *
 */
template <typename Cb, typename... Data>
NODE_EXTERN int AtExitHook(Cb&& cb, Data&&... data);

/**
 * @brief Register a hook(function) to be called when the event loop of any of
 * the active JS threads is blocked for longer than a threshold.
 *
 * @param threshold in milliseconds that an event loop needs to be blocked
 * before the registered hook is called.
 * @param cb hook function with the following signature:
 * `cb(SharedEnvInst, std::string info, ...Data)`
 * @param data variable number of arguments to be propagated to the callback.
 * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
 * error value otherwise.
 */
template <typename Cb, typename... Data>
NODE_EXTERN int OnBlockedLoopHook(uint64_t threshold, Cb&& cb, Data&&... data);
/**
 * @brief Register a hook(function) to be called when the event loop moves from
 * the blocked-loop state to not being blocked.
 *
 * @param cb hook function with the following signature:
 * `cb(SharedEnvInst, std::string info, ...Data)`
 * @param data variable number of arguments to be propagated to the callback.
 * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
 * error value otherwise.
 */
template <typename Cb, typename... Data>
NODE_EXTERN int OnUnblockedLoopHook(Cb&& cb, Data&&... data);

/**
 * @brief Register a hook(function) to be called when the initial configuration
 * has been read and set, or whenever the configuration has been changed.
 *
 */
template <typename Cb, typename... Data>
NODE_EXTERN int OnConfigurationHook(Cb&& cb, Data&&... data);

/**
 * @brief The struct containing log info that's passed to the OnLogWriteHook
 * callback.
 */
struct LogWriteInfo {
  std::string msg;
  uint32_t severity;
  uint64_t timestamp;     // nanoseconds since unix epoch
  std::string trace_id;   // byte sequence
  std::string span_id;    // byte sequence
  uint32_t trace_flags;
};

/**
 * @brief Register a hook(function) to be called when a log line is written.
 * The callback is called from N|Solid thread.
 * @param cb hook function with the following signature:
 * `cb(SharedEnvInst, LogWriteInfo, ...Data)`
 * @param data variable number of arguments to be propagated to the callback.
 * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
 * error value otherwise.
 */
template <typename Cb, typename... Data>
NODE_EXTERN int OnLogWriteHook(Cb&& cb, Data&&... data);

/**
 * @brief Register a hook(function) to be called any time a JS thread is
 * created.
 *
 * @param cb hook function with the following signature:
 * `cb(SharedEnvInst, ...Data)` that will be called on JS thread creation.
 * @param data variable number of arguments to be propagated to the callback.
 * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
 * error value otherwise.
 */
template <typename Cb, typename... Data>
NODE_EXTERN int ThreadAddedHook(Cb&& cb, Data&&... data);
/**
 * @brief Register a hook(function) to be called any time a JS thread is
 * destroyed.
 *
 * @param cb hook function with the following signature:
 * `cb(SharedEnvInst, ...Data)` that will be called on JS thread
 * destruction.
 * @param data variable number of arguments to be propagated to the callback.
 * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
 * error value otherwise.
 */
template <typename Cb, typename... Data>
NODE_EXTERN int ThreadRemovedHook(Cb&& cb, Data&&... data);


/**
 * @brief Defines the types of metrics supported
 *
 */
enum class NODE_EXTERN MetricsType: unsigned int {
  ECounter, /**< Single, monotonically increasing, cumulative metric. */
  EGauge, /**< A single numerical value that can arbitrarily go up and down.*/
  ESeries,
  EOther
};


/**
 * @brief Class that allows to retrieve process-wide metrics.
 *
 */
class NODE_EXTERN ProcessMetrics {
 public:
 /**
  * @brief Construct a new Process Metrics object
  *
  */
  ProcessMetrics();
  /**
   * @brief Destroy the Process Metrics object
   *
   */
  ~ProcessMetrics();

  /**
   * @brief struct to store process metrics data.
   *
   */
  struct MetricsStor {
#define PM1(Type, CName, JSName, MType, Unit) Type CName;
    NSOLID_PROCESS_METRICS_STRINGS(PM1)
#undef PM1
#define PM2(Type, CName, JSName, MType, Unit) Type CName = 0;
    NSOLID_PROCESS_METRICS_NUMBERS(PM2)
#undef PM2
    // This is a duplicate of cpuPercent, for backwards compatibility.
    double cpu = 0;
  };

  /**
   * @brief Returns the current N|Solid process-wide metrics in JSON format
   *
   * @return std::string
   */
  std::string toJSON();
  /**
   * @brief It retrieves the current N|Solid process-wide metrics. A previous
   * call to Update() is needed.
   */
  MetricsStor Get();
  /**
   * @brief Calculates and stores the N|Solid process-wide metrics.
   *
   * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
   * error value otherwise.
   */
  int Update();

 private:
  uv_mutex_t stor_lock_;
  MetricsStor stor_;
  uint64_t cpu_prev_[3];
  uint64_t cpu_prev_time_;
};


/**
 * @brief Class that allows to retrieve thread-specific metrics from a process.
 *
 */
class NODE_EXTERN ThreadMetrics :
  public std::enable_shared_from_this<ThreadMetrics> {
 public:
  using thread_metrics_proxy_sig = void(*)(SharedThreadMetrics);

  /**
   * @brief struct to store thread metrics data.
   *
   */
  struct MetricsStor {
#define EM1(Type, CName, JSName, MType, Unit) Type CName;
    NSOLID_ENV_METRICS_STRINGS(EM1)
#undef EM1
#define EM2(Type, CName, JSName, MType, Unit) Type CName = 0;
    NSOLID_ENV_METRICS_NUMBERS(EM2)
#undef EM2
   private:
    friend class ThreadMetrics;
    friend class EnvInst;
    uint64_t prev_idle_time_ = 0;
    uint64_t prev_call_time_;
    uint64_t current_hrtime_;
  };

  /**
   * @brief Create a SharedThreadMetrics instance
   *
   * @param envinst SharedEnvInst of the thread to take the metrics from.
   */
  static SharedThreadMetrics Create(SharedEnvInst envinst);

  ThreadMetrics() = delete;
  ThreadMetrics(const ThreadMetrics&) = delete;
  ThreadMetrics& operator=(const ThreadMetrics&) = delete;
  ThreadMetrics(ThreadMetrics&&) = delete;
  ThreadMetrics& operator=(ThreadMetrics&&) = delete;

  /**
   * @brief Returns the current N|Solid JS thread metrics in JSON format. The
   * call is thread-safe.
   *
   * @return std::string
   */
  std::string toJSON();
  /**
   * @brief It retrieves the current N|Solid JS thread metrics. A previous
   * call to Update() is needed. The call is thread-safe.
   * @param stor A MetricsStor object where the actual metrics will be written
   * to.
   * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
   * error value otherwise.
   */
  MetricsStor Get();

  /**
   * @brief Calculates and stores the N|Solid JS thread metrics. A callback is
   * called when the retrieval has completed.
   *
   * @param cb callback function with the following signature
   * `void(*)(SharedThreadMetrics, ...Data)`.
   * @param data variable number of arguments to be propagated to the callback.
   * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
   * error value otherwise.
   */
  template <typename Cb, typename... Data>
  int Update(Cb&& cb, Data&&... data);

  /**
   * @brief Calculate and store the N|Solid JS thread metrics synchronously.
   * This must only be called from the same thread as the EnvInst.
   */
  int Update(v8::Isolate* isolate);

  constexpr uint64_t thread_id() const { return thread_id_; }

 private:
  friend class EnvInst;

  explicit ThreadMetrics(SharedEnvInst envinst);
  explicit ThreadMetrics(uint64_t thread_id);
  ~ThreadMetrics();
  int get_thread_metrics_();
  void reset();

  template <typename G>
  static void thread_metrics_proxy_(SharedThreadMetrics tm_sp);

  uint64_t thread_id_ = 0xFFFFFFFFFFFFFFFF;
  internal::user_data user_data_;
  thread_metrics_proxy_sig proxy_;

  std::atomic<bool> update_running_ = {false};
  uv_mutex_t stor_lock_;
  MetricsStor stor_;
};


/**
 * @brief Class to retrieve a stream of some thread-specific metrics.
 *
 * For some specific metrics: dns request duration, http client transaction
 * duration, http server transaction duration and garbage collection duration,
 * it's useful to receive all the datapoints collected by the N|Solid runtime
 * instead of (or in addition to) the derived metrics calculated by N|Solid such
 * as: dns_count, dns_median, dns99_ptile, etc. The MetricsStrem provides that
 * specific feature.
 */
class NODE_EXTERN MetricsStream {
 public:
  /**
   * @brief types of metrics that can be collected using MetricsStream.
   *
   * They can be combined in a flags field to specify which metrics are to be
   * collected.
   */
  enum class Type: uint32_t {
    kDns = 1 << 0, /**< DNS request duration */
    kHttpClient = 1 << 1, /**< HTTP client transaction duration */
    kHttpServer = 1 << 2, /**< HTTP server transaction duration */
    kGcRegular = 1 << 3, /**< Duration of a "regular" garbage collection */
    kGcForced = 1 << 4, /**< Duration of a "forced" garbage collection */
    kGcFull = 1 << 5, /**< Duration of a "full" garbage collection */
    kGcMajor = 1 << 6, /**< Duration of a "major" garbage collection */
    kGc = 120 /**< kGcRegular | kGcForced | kGcFull | kGcMajor */
  };

  struct Datapoint {
    uint64_t thread_id;
    double timestamp; /**< Datapoint timestamp in milliseconds */
    Type type;
    double value;
  };

  using metrics_stream_bucket = std::vector<Datapoint>;
  using metrics_stream_proxy_sig = void(*)(MetricsStream*,
                                           const metrics_stream_bucket&,
                                           void*);

  /**
   * @brief Destroy the Metrics Stream object
   *
   */
  ~MetricsStream();

  // The callback is called from the NSolid thread.
  // signature: cb(MetricsStream*, metrics_stream_bucket, ...Data)
  /**
   * @brief Creates a MetricsStream instance which sets up a hook to consume
   * a DataPoint stream of a specific kind of metrics.
   *
   * The Datapoints will be returned sporadically using the registered hook in a
   * `metrics_stream_bucket`.
   *
   * @param flags allows filtering which specific metrics are going to be
   * retrieved.
   * @param cb hook function with the following signature:
   * `cb(MetricsStream*, metrics_stream_bucket, ...Data)`. It is called from the
   * NSolid thread.
   * @param data variable number of arguments to be propagated to the hook.
   * @return MetricsStream instance.
   */
  template <typename Cb, typename... Data>
  static MetricsStream* CreateInstance(uint32_t flags, Cb&& cb, Data&&... data);

 private:
  template <typename G>
  static void metrics_stream_proxy_(MetricsStream*,
                                    const metrics_stream_bucket&,
                                    void*);

  MetricsStream();

  void DoSetup(uint32_t flags,
               metrics_stream_proxy_sig,
               internal::deleter_sig,
               void* cb);

  class Impl;
  std::unique_ptr<Impl> impl_;
};


/**
 * @brief Class to setup a hook (callback) to retrieve tracing span data from a
 * specific JS thread in the runtime.
 */
class NODE_EXTERN Tracer {
 public:
  enum SpanKind {
    kInternal = 0,
    kServer = 1,
    kClient = 2,
    kProducer = 3,
    kConsumer = 4
  };

  enum SpanStatusCode {
    kUnset = 0,
    kOk = 1,
    kError = 2
  };

  /**
   * @brief List of tracing span types
   */
  enum SpanType {
#define V(Type, Val, Str)                                                      \
    Type = Val,
  NSOLID_SPAN_TYPES(V)
#undef V
  };

  /**
   * @brief List of reasons a tracing span may end.
   */
  enum EndReason {
#define V(Type)                                                                \
    Type,
  NSOLID_SPAN_END_REASONS(V)
#undef V
  };

  /**
   * @brief POD type to store tracing span data.
   *
   */
  struct SpanStor {
    std::string span_id;
    std::string parent_id;
    std::string trace_id;
    std::string name;
    uint64_t thread_id;
    double start;
    double end;
    SpanKind kind;
    SpanType type;
    SpanStatusCode status_code;
    std::string status_msg;
    EndReason end_reason;
    std::string attrs;
    std::vector<std::string> extra_attrs;
    std::vector<std::string> events;
  };

  using tracer_proxy_sig = void(*)(Tracer*, const SpanStor&, void*);

  /**
   * @brief Destroy the Tracer object
   *
   */
  ~Tracer();

  /**
   * @brief sets up a hook to receive tracing spans from the runtime and returns
   * a Tracer instance. This call is thread-safe.
   * @param flags flags to filter which kind of traces the hook is going to
   * receive. This value should be a combination of SpanType values.
   * @param cb callback function with the following signature:
   * `cb(Tracer* tracer, const SpanStor& stor, ...Data)`. This callback is
   * called from the NSolid thread.
   * @param data variable number of arguments to be propagated to the callback.
   * @return a Tracer instance after setting up the tracer hook.
   *
   */
  template <typename Cb, typename... Data>
  static Tracer* CreateInstance(uint32_t flags, Cb&& cb, Data&&... data);

 private:
  template <typename G>
  static void trace_proxy_(Tracer*, const SpanStor&, void*);

  Tracer();

  void DoSetup(uint32_t flags, tracer_proxy_sig, internal::deleter_sig, void*);

  class Impl;
  std::unique_ptr<Impl> impl_;
};


/**
 * @brief class that allows to take CPU profiles from a specific JS thread.
 *
 */
class NODE_EXTERN CpuProfiler {
 public:
  using cpu_profiler_proxy_sig = void(*)(int, std::string, void*);

  CpuProfiler() = delete;
  ~CpuProfiler() = delete;
  /**
   * @brief allows taking a CPU profile from a specific JS thread for a period
   * of time. Only 1 concurrent profile per thread can be taken.
   *
   * @param envinst SharedEnvInst of thread to take the profile from.
   * @param duration duration in milliseconds of the CPU profile after which the
   * profile will be returned in the callback.
   * @param cb callback function with the following signature:
   * `cb(int status, std::string json, ...Data)`
   * @param data variable number of arguments to be propagated to the callback.
   * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
   * error value otherwise.
   */
  template <typename Cb, typename... Data>
  static int TakeProfile(SharedEnvInst envinst,
                         uint64_t duration,
                         Cb&& cb,
                         Data&&... data);
  /**
   * @brief stops an in-progress CPU profiling from a specific thread_id
   *
   * @param thread_id
   * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
   * error value otherwise.
   */
  static int StopProfile(SharedEnvInst envinst);

  static int StopProfileSync(SharedEnvInst envinst);

 private:
  static int get_cpu_profile_(SharedEnvInst envinst,
                              uint64_t duration,
                              void* data,
                              cpu_profiler_proxy_sig proxy,
                              internal::deleter_sig deleter);
  template <typename G>
  static void cpu_profiler_proxy_(int status, std::string json, void* data);
};


/**
 * @brief class that allows taking heap snapshots from a specific JS thread.
 *
 */
class NODE_EXTERN Snapshot {
 public:
  using snapshot_proxy_sig = void(*)(int, std::string, void*);

  Snapshot() = delete;
  ~Snapshot() = delete;

  /**
   * @brief allows taking a heap snapshot from a specific JS thread. Only 1
   * concurrent snapshot per thread can be taken.
   *
   * @param envinst SharedEnvInst of thread to take the snapshot from.
   * @param redacted to get redacted strings in the heap snapshot.
   * @param cb callback function with the following signature:
   * `cb(int status, std::string snapshot, ...Data)`. It will be called from the
   * NSolid thread.
   * @param data variable number of arguments to be propagated to the callback.
   * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
   * error value otherwise.
   */
  template <typename Cb, typename... Data>
  static int TakeSnapshot(SharedEnvInst envinst,
                          bool redacted,
                          Cb&& cb,
                          Data&&... data);

  /**
   * @brief activates the heap profiler tracking objects from a specific JS
   * thread.
   *
   * @param envinst SharedEnvInst of thread to take the snapshot from.
   * @param redacted to get redacted strings in the heap snapshot.
   * @param trackAllLocations record stack traces of allocations, set this as
   * as true will add a significant overhead.
   * @param duration duration in milliseconds of the heap profiler after which
   * the heap snapshot will be returned in the callback.
   * @param data variable number of arguments to be propagated to the callback.
   * @param cb callback function with the following signature:
   * `cb(int status, std::string snapshot, ...Data)`. It will be called from the
   * NSolid thread.
   * @param data variable number of arguments to be propagated to the callback.
   * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
   * error value otherwise.
   */
  template <typename Cb, typename... Data>
  static int StartTrackingHeapObjects(SharedEnvInst envinst,
                                      bool redacted,
                                      bool trackAllocations,
                                      uint64_t duration,
                                      Cb&& cb,
                                      Data&&... data);

  /**
   * @brief same as TakeSnapshot but stops tracking heap objects in the heap
   * profiler.
   *
   * @param envinst SharedEnvInst of thread to take the snapshot from.
   * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
   * error value otherwise.
   */
  static int StopTrackingHeapObjects(SharedEnvInst envinst);

  /**
   * @brief same as TakeSnapshot but stops tracking heap objects in the heap
   * profiler synchronously.
   *
   * @param envinst SharedEnvInst of thread to take the snapshot from.
   * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
   * error value otherwise.
   */
  static int StopTrackingHeapObjectsSync(SharedEnvInst envinst);

  /**
   * @brief Will start sampling heap allocations.
   *
   * @param envinst SharedEnvInst of thread to take a sampled snapshot from.
   * @param duration duration in milliseconds of the heap profiler after which
   * the sampled heap snapshot will be returned in the callback.
   * @param cb callback function with the following signature:
   * `cb(int status, std::string snapshot, ...Data)`. It will be called from the
   * NSolid thread.
   * @param data variable number of arguments to be propagated to the callback.
   * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
   * error value otherwise.
   */
  template <typename Cb, typename... Data>
  static int StartSampling(SharedEnvInst envinst,
                           uint64_t duration,
                           Cb&& cb,
                           Data&&... data);

  /**
   * @brief Will start sampling heap allocations.
   *
   * @param envinst SharedEnvInst of thread to take the snapshot from.
   * @param sample_interval frequency (in bytes) at which the heap profiler
   * samples are taken. Each allocation is sampled every sample_interval bytes
   * allocated.
   * @param stack_depth refers to the depth of the call stack that will be
   * captured during heap profiling
   * @param flags additional flags or options that can be used when
   * starting heap profiling. See
   * \link v8::HeapProfiler::SamplingFlags SamplingFlags\endlink
   * for available flags.
   * @param duration duration in milliseconds of the heap profiler after which
   * the heap snapshot will be returned in the callback.
   * @param cb callback function with the following signature:
   * `cb(int status, std::string snapshot, ...Data)`. It will be called from the
   * NSolid thread.
   * @param data variable number of arguments to be propagated to the callback.
   * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
   * error value otherwise.
   */
  template <typename Cb, typename... Data>
  static int StartSampling(SharedEnvInst envinst,
                           uint64_t sample_interval,
                           int stack_depth,
                           v8::HeapProfiler::SamplingFlags flags,
                           uint64_t duration,
                           Cb&& cb,
                           Data&&... data);

  /**
   * @brief  Stops the HeapProfiler allocation sampler
   * @param envinst SharedEnvInst of thread to take the snapshot from.
   * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
   * error value otherwise.
   */
  static int StopSampling(SharedEnvInst envinst);

  /**
   * @brief  Stops the HeapProfiler allocation sampler synchronously
   * @param envinst SharedEnvInst of thread to take the snapshot from.
   * @return NSOLID_E_SUCCESS in case of success or a different NSOLID_E_
   * error value otherwise.
   */
  static int StopSamplingSync(SharedEnvInst envinst);

 private:
  static int start_tracking_heap_objects_(SharedEnvInst envinst,
                                          bool redacted,
                                          bool track_allocations,
                                          uint64_t duration,
                                          internal::user_data data,
                                          snapshot_proxy_sig proxy);

  static int start_allocation_sampling_(SharedEnvInst envinst,
                                        uint64_t sample_interval,
                                        int stack_depth,
                                        v8::HeapProfiler::SamplingFlags flags,
                                        uint64_t duration,
                                        internal::user_data data,
                                        snapshot_proxy_sig proxy);


  static int get_snapshot_(SharedEnvInst envinst,
                           bool redacted,
                           void* data,
                           snapshot_proxy_sig proxy,
                           internal::deleter_sig deleter);
  template <typename G>
  static void snapshot_proxy_(int status, std::string profile, void* data);
};



// DEFINITIONS //
/** @cond DONT_DOCUMENT */
template <typename Cb, typename... Data>
int ThreadMetrics::Update(Cb&& cb, Data&&... data) {
  bool expected = false;
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, std::forward<Data>(data)...));

  update_running_.compare_exchange_strong(expected, true);
  if (expected) {
    return UV_EBUSY;
  }

  user_data_ = internal::user_data(
    new (std::nothrow) UserData(
      std::bind(std::forward<Cb>(cb), _1, std::forward<Data>(data)...)),
    internal::delete_proxy_<UserData>);

  if (user_data_ == nullptr) {
    return UV_ENOMEM;
  }

  stor_.thread_id = thread_id_;
  proxy_ = thread_metrics_proxy_<UserData>;

  int er = get_thread_metrics_();
  if (er) {
    reset();
  }
  return er;
}


template <typename G>
void ThreadMetrics::thread_metrics_proxy_(SharedThreadMetrics tm_sp) {
  G* g = static_cast<G*>(tm_sp->user_data_.get());
  tm_sp->reset();
  (*g)(tm_sp);
}


template <typename Cb, typename... Data>
MetricsStream* MetricsStream::CreateInstance(uint32_t flags,
                                             Cb&& cb,
                                             Data&&... data) {
  MetricsStream* stream = new (std::nothrow) MetricsStream();
  if (stream == nullptr) {
    return stream;
  }
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));
  // _1 - MetricsStream* metrics_stream
  // _2 - const metrics_stream_bucket& bucket
  UserData* user_data = new (std::nothrow) UserData(
      std::bind(std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));

  if (user_data == nullptr) {
    return nullptr;
  }

  stream->DoSetup(flags,
                  metrics_stream_proxy_<UserData>,
                  internal::delete_proxy_<UserData>,
                  static_cast<void*>(user_data));

  return stream;
}


template <typename G>
void MetricsStream::metrics_stream_proxy_(
    MetricsStream* ms, const metrics_stream_bucket& bucket, void* g) {
  (*static_cast<G*>(g))(ms, bucket);
}


template <typename Cb, typename... Data>
Tracer* Tracer::CreateInstance(uint32_t flags, Cb&& cb, Data&&... data) {
  Tracer* tracer = new (std::nothrow) Tracer();
  if (tracer == nullptr) {
    return tracer;
  }
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));
  // _1 - Tracer*
  // _2 - const SpanStor&
  UserData* user_data = new (std::nothrow) UserData(
      std::bind(std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));

  if (user_data == nullptr) {
    return nullptr;
  }

  tracer->DoSetup(flags,
                  trace_proxy_<UserData>,
                  internal::delete_proxy_<UserData>,
                  static_cast<void*>(user_data));
  return tracer;
}


template <typename G>
void Tracer::trace_proxy_(Tracer* tracer,
                          const SpanStor& stor,
                          void* g) {
  (*static_cast<G*>(g))(tracer, stor);
}


template <typename Cb, typename... Data>
int CpuProfiler::TakeProfile(SharedEnvInst envinst,
                             uint64_t duration,
                             Cb&& cb,
                             Data&&... data) {
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));

  // _1 - int status
  // _2 - std::string json
  UserData* user_data = new (std::nothrow) UserData(
      std::bind(std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));

  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  int er = get_cpu_profile_(envinst,
                            duration,
                            user_data,
                            cpu_profiler_proxy_<UserData>,
                            internal::delete_proxy_<UserData>);
  if (er) {
    delete user_data;
  }

  return er;
}


template <typename G>
void CpuProfiler::cpu_profiler_proxy_(int status,
                                      std::string json,
                                      void* data) {
  (*static_cast<G*>(data))(status, json);
}

template <typename Cb, typename... Data>
int Snapshot::StartTrackingHeapObjects(SharedEnvInst envinst,
                                       bool redacted,
                                       bool trackAllocations,
                                       uint64_t duration,
                                       Cb&& cb,
                                       Data&&... data) {
  if (envinst == nullptr) {
    return UV_ESRCH;
  }

  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
      std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));

  auto user_data = internal::user_data(new (std::nothrow) UserData(
      std::bind(std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...)),
                        internal::delete_proxy_<UserData>);
  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  return start_tracking_heap_objects_(envinst,
                                      redacted,
                                      trackAllocations,
                                      duration,
                                      std::move(user_data),
                                      snapshot_proxy_<UserData>);
}


template <typename Cb, typename... Data>
int Snapshot::StartSampling(SharedEnvInst envinst,
                            uint64_t duration,
                            Cb&& cb,
                            Data&&... data) {
  // Use default profiler values
  uint64_t sample_interval = 512 * 1024;
  int stack_depth = 16;
  return Snapshot::StartSampling(envinst,
                                 sample_interval,
                                 stack_depth,
                                 v8::HeapProfiler::kSamplingNoFlags,
                                 duration,
                                 cb,
                                 data...);
}

template <typename Cb, typename... Data>
int Snapshot::StartSampling(SharedEnvInst envinst,
                            uint64_t sample_interval,
                            int stack_depth,
                            v8::HeapProfiler::SamplingFlags flags,
                            uint64_t duration,
                            Cb&& cb,
                            Data&&... data) {
  if (envinst == nullptr) {
    return UV_ESRCH;
  }

  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
      std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));

  auto user_data = internal::user_data(new (std::nothrow) UserData(
      std::bind(std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...)),
                        internal::delete_proxy_<UserData>);
  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  return start_allocation_sampling_(envinst,
                                    sample_interval,
                                    stack_depth,
                                    flags,
                                    duration,
                                    std::move(user_data),
                                    snapshot_proxy_<UserData>);
}


template <typename Cb, typename... Data>
int Snapshot::TakeSnapshot(SharedEnvInst envinst,
                           bool redacted,
                           Cb&& cb,
                           Data&&... data) {
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));

  // _1 - int status
  // _2 - std::string json
  UserData* user_data = new (std::nothrow) UserData(
      std::bind(std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));

  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  int er = get_snapshot_(envinst,
                         redacted,
                         user_data,
                         snapshot_proxy_<UserData>,
                         internal::delete_proxy_<UserData>);

  if (er) {
    delete user_data;
  }

  return er;
}


template <typename G>
void Snapshot::snapshot_proxy_(int status, std::string profile, void* data) {
  (*static_cast<G*>(data))(status, profile);
}


template <typename Cb, typename... Data>
int QueueCallback(Cb&& cb, Data&&... data) {
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), std::forward<Data>(data)...));

  UserData* user_data = new (std::nothrow)
      UserData(std::bind(std::forward<Cb>(cb), std::forward<Data>(data)...));

  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  int er = internal::queue_callback_(user_data,
                                     internal::queue_callback_proxy_<UserData>);

  if (er) {
    delete user_data;
  }

  return er;
}


template <typename Cb, typename... Data>
int QueueCallback(uint64_t timeout, Cb&& cb, Data&&... data) {
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), std::forward<Data>(data)...));

  UserData* user_data = new (std::nothrow)
      UserData(std::bind(std::forward<Cb>(cb), std::forward<Data>(data)...));

  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  int er = internal::queue_callback_(
      timeout, user_data, internal::queue_callback_proxy_<UserData>);

  if (er) {
    delete user_data;
  }

  return er;
}


template <typename Cb, typename... Data>
int RunCommand(SharedEnvInst envinst,
               CommandType type,
               Cb&& cb,
               Data&&... data) {
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, std::forward<Data>(data)...));
  // _1 - SharedEnvInst
  UserData* user_data = new (std::nothrow) UserData(
      std::bind(std::forward<Cb>(cb), _1, std::forward<Data>(data)...));

  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  int er = internal::run_command_(
      envinst, type, user_data, internal::run_command_proxy_<UserData>);

  if (er) {
    delete user_data;
  }

  return 0;
}


template <typename Cb, typename... Data>
int CustomCommand(SharedEnvInst envinst,
                  std::string req_id,
                  std::string command,
                  std::string args,
                  Cb&& cb,
                  Data&&... data) {
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, _2, _3, _4, _5, std::forward<Data>(data)...));

  // _1 - std::string req_id
  // _2 - std::string command
  // _3 - int status
  // _4 - std::pair<bool, std::string> error
  // _5 - std::pair<bool, std::string> value
  UserData* user_data = new (std::nothrow) UserData(std::bind(
      std::forward<Cb>(cb), _1, _2, _3, _4, _5, std::forward<Data>(data)...));

  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  int er = internal::custom_command_(envinst,
                                     req_id,
                                     command,
                                     args,
                                     user_data,
                                     internal::custom_command_proxy_<UserData>);

  if (er) {
    delete user_data;
  }

  return er;
}


template <typename Cb, typename... Data>
int AtExitHook(Cb&& cb, Data&&... data) {
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));

  // _1 - bool on_signal
  // _2 - bool profile_stopped
  UserData* user_data = new (std::nothrow) UserData(
      std::bind(std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));

  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  int er = internal::at_exit_hook_(user_data,
                                   internal::at_exit_hook_proxy_<UserData>,
                                   internal::delete_proxy_<UserData>);

  if (er) {
    delete user_data;
  }

  return er;
}


template <typename Cb, typename... Data>
int OnBlockedLoopHook(uint64_t threshold, Cb&& cb, Data&&... data) {
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));

  // _1 - SharedEnvInst envinst
  // _2 - std::string info
  UserData* user_data = new (std::nothrow) UserData(std::bind(
        std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));

  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  internal::on_block_loop_hook_(
      threshold,
      user_data,
      internal::on_block_loop_hook_proxy_<UserData>,
      internal::delete_proxy_<UserData>);
  return 0;
}


template <typename Cb, typename... Data>
int OnUnblockedLoopHook(Cb&& cb, Data&&... data) {
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));

  // _1 - SharedEnvInst envinst
  // _2 - std::string info
  UserData* user_data = new (std::nothrow) UserData(std::bind(
        std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));
  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  internal::on_unblock_loop_hook_(
    user_data,
    internal::on_unblock_loop_hook_proxy_<UserData>,
    internal::delete_proxy_<UserData>);
  return 0;
}


template <typename Cb, typename... Data>
int OnConfigurationHook(Cb&& cb, Data&&... data) {
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, std::forward<Data>(data)...));

  // _1 - std::string info
  UserData* user_data = new (std::nothrow) UserData(std::bind(
        std::forward<Cb>(cb), _1, std::forward<Data>(data)...));
  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  internal::on_configuration_hook_(
    user_data,
    internal::on_configuration_hook_proxy_<UserData>,
    internal::delete_proxy_<UserData>);
  return 0;
}


template <typename Cb, typename... Data>
int OnLogWriteHook(Cb&& cb, Data&&... data) {
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));

  // _1 - SharedEnvInst
  // _2 - LogWriteInfo
  UserData* user_data = new (std::nothrow) UserData(std::bind(
        std::forward<Cb>(cb), _1, _2, std::forward<Data>(data)...));
  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  internal::on_log_write_hook_(
    user_data,
    internal::on_log_write_hook_proxy_<UserData>,
    internal::delete_proxy_<UserData>);
  return 0;
}


template <typename Cb, typename... Data>
int ThreadAddedHook(Cb&& cb, Data&&... data) {
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, std::forward<Data>(data)...));

  // _1 - SharedEnvInst
  UserData* user_data = new (std::nothrow) UserData(std::bind(
        std::forward<Cb>(cb), _1, std::forward<Data>(data)...));
  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  internal::thread_added_hook_(user_data,
                               internal::thread_added_hook_proxy_<UserData>,
                               internal::delete_proxy_<UserData>);
  return 0;
}


template <typename Cb, typename... Data>
int ThreadRemovedHook(Cb&& cb, Data&&... data) {
  // NOLINTNEXTLINE(build/namespaces)
  using namespace std::placeholders;
  using UserData = decltype(std::bind(
        std::forward<Cb>(cb), _1, std::forward<Data>(data)...));

  // _1 - SharedEnvInst
  UserData* user_data = new (std::nothrow) UserData(std::bind(
        std::forward<Cb>(cb), _1, std::forward<Data>(data)...));
  if (user_data == nullptr) {
    return UV_ENOMEM;
  }

  internal::thread_removed_hook_(
      user_data,
      internal::thread_removed_hook_proxy_<UserData>,
      internal::delete_proxy_<UserData>);
  return 0;
}


namespace internal {

template <typename G>
void queue_callback_proxy_(void* data) {
  (*static_cast<G*>(data))();
  delete static_cast<G*>(data);
}

template <typename G>
void run_command_proxy_(SharedEnvInst envinst, void* data) {
  (*static_cast<G*>(data))(envinst);
  delete static_cast<G*>(data);
}

template <typename G>
void custom_command_proxy_(std::string req_id,
                           std::string command,
                           int status,
                           std::pair<bool, std::string> error,
                           std::pair<bool, std::string> value,
                           void* data) {
  (*static_cast<G*>(data))(req_id, command, status, error, value);
  delete static_cast<G*>(data);
}

template <typename G>
void at_exit_hook_proxy_(bool on_signal, bool profile_stopped, void* data) {
  (*static_cast<G*>(data))(on_signal, profile_stopped);
}

template <typename G>
void on_block_loop_hook_proxy_(SharedEnvInst envinst,
                               std::string info,
                               void* data) {
  (*static_cast<G*>(data))(envinst, info);
}

template <typename G>
void on_unblock_loop_hook_proxy_(SharedEnvInst envinst,
                                 std::string info,
                                 void* data) {
  (*static_cast<G*>(data))(envinst, info);
}

template <typename G>
void on_configuration_hook_proxy_(std::string info, void* data) {
  (*static_cast<G*>(data))(info);
}

template <typename G>
void on_log_write_hook_proxy_(SharedEnvInst inst,
                              LogWriteInfo info,
                              void* data) {
  (*static_cast<G*>(data))(inst, std::move(info));
}

template <typename G>
void thread_added_hook_proxy_(SharedEnvInst envinst, void* data) {
  (*static_cast<G*>(data))(envinst);
}

template <typename G>
void thread_removed_hook_proxy_(SharedEnvInst envinst, void* data) {
  (*static_cast<G*>(data))(envinst);
}

template <typename G>
void delete_proxy_(void* g) {
  delete static_cast<G*>(g);
}

}  // namespace internal
/** @endcond */

}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_H_
