#ifndef SRC_NSOLID_CONTINUOUS_PROFILER_H_
#define SRC_NSOLID_CONTINUOUS_PROFILER_H_

#include "nsolid_api.h"
#include <nsolid/thread_safe.h>
#include <nsolid/async_ts_queue.h>
#include "../../agents/src/profile_collector.h"
#include "nsuv-inl.h"
#include <memory>
#include <functional>
#include <atomic>
#include <vector>
#include <unordered_set>

namespace node {
namespace nsolid {

class ContinuousProfiler;

using SharedContinuousProfiler = std::shared_ptr<ContinuousProfiler>;
using WeakContinuousProfiler = std::weak_ptr<ContinuousProfiler>;

/**
 * ContinuousProfiler is a class that periodically collects
 * CPU profiles for all active JS threads and sends them via registered
 * callbacks.
 *
 * The profiler is disabled by default and must be enabled via
 * SetProfilingEnabled(). It will only collect profiles when both:
 * 1. Profiling is enabled via SetProfilingEnabled()
 * 2. There is at least one registered hook
 */
class ContinuousProfiler :
  public std::enable_shared_from_this<ContinuousProfiler> {
 public:
  // Profile data callback type
  using ProfileHookCallback = std::function<void(
      const ProfileCollector::ProfileQStor&)>;

  // Constructor
  explicit ContinuousProfiler(uv_loop_t* loop);

  // Initialize the profiler
  void Initialize();

  // Enable/disable profiling (disabled by default)
  void Disable();
  void Enable(uint64_t interval_ms = 60000);
  bool IsEnabled();

  // Register a hook for profile data
  // Returns a unique ID that can be used to unregister the hook
  template <typename Cb, typename... Data>
  uint64_t RegisterHook(Cb&& cb, Data&&... data) {
    // Create the bound callback with additional parameters
    auto bound_cb = std::bind(
        std::forward<Cb>(cb),
        std::placeholders::_1,
        std::forward<Data>(data)...);

    // Convert to ProfileHookCallback type and register
    return register_hook_impl(
        [bound_cb](const ProfileCollector::ProfileQStor& profile_data) {
          bound_cb(profile_data);
        });
  }

  // Unregister a hook by its ID
  // Returns true if the hook was found and removed
  bool UnregisterHook(uint64_t hook_id);

  // Destructor
  ~ContinuousProfiler();

 private:
  // Prevent copying, assignment, and move
  ContinuousProfiler(const ContinuousProfiler&) = delete;
  ContinuousProfiler& operator=(const ContinuousProfiler&) = delete;
  ContinuousProfiler(ContinuousProfiler&&) = delete;
  ContinuousProfiler& operator=(ContinuousProfiler&&) = delete;

  // Start the profiler if there are callbacks registered and profiling is
  // enabled
  void start_if_needed();

  // Stop the profiler if there are no callbacks or profiling is disabled
  void stop_if_needed();

  // Thread hooks
  static void thread_added_callback(SharedEnvInst envinst,
                                    WeakContinuousProfiler wp);
  static void thread_removed_callback(SharedEnvInst envinst,
                                      WeakContinuousProfiler wp);

  static void prepare_cb(nsuv::ns_prepare* prepare, WeakContinuousProfiler wp);

  // Thread event handlers
  void on_thread_added(SharedEnvInst envinst);
  void on_thread_removed(SharedEnvInst envinst);

  void on_prepare();

  // Profile collector callback
  void on_profile_data(const ProfileCollector::ProfileQStor& data);

  // Start profiling for all threads
  void start_cpu_profiling();

  // Start profiling for a specific thread
  int start_cpu_profiling_for_thread(uint64_t thread_id);

  // Handle profile completion and start a new one if needed
  void on_profile_completed(uint64_t thread_id);

  // Implementation of RegisterHook
  uint64_t register_hook_impl(ProfileHookCallback callback);

  // Loop
  uv_loop_t* loop_ = nullptr;
  uint64_t interval_ = 60000;  // Default: 1 minute per configuration
  bool enabled_ = false;  // Disabled by default per config

  // Thread management
  nsuv::ns_mutex thread_mutex_;
  std::unordered_set<uint64_t> thread_ids_;
  std::unordered_set<uint64_t> currently_profiling_threads_;
  std::unordered_set<uint64_t> pending_threads_;

  nsuv::ns_prepare* prepare_;

  // Callback management
  nsuv::ns_mutex callback_mutex_;
  std::unordered_map<uint64_t, ProfileHookCallback> callbacks_;
  uint64_t next_callback_id_ = 1;

  // Profile collector
  std::shared_ptr<ProfileCollector> profile_collector_;
};

}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_CONTINUOUS_PROFILER_H_
