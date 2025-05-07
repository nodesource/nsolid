#include "continuous_profiler.h"
#include "asserts-cpp/asserts.h"

namespace node {
namespace nsolid {

ContinuousProfiler::ContinuousProfiler(uv_loop_t* loop):
    loop_(loop),
    enabled_(false),
    prepare_(new nsuv::ns_prepare()),
    next_callback_id_(1) {
  ASSERT_EQ(0, thread_mutex_.init(true));
  ASSERT_EQ(0, callback_mutex_.init(true));
  ASSERT_EQ(0, prepare_->init(loop_));
}

ContinuousProfiler::~ContinuousProfiler() {
  prepare_->close_and_delete();
}

void ContinuousProfiler::Initialize() {
  // Create the profile collector
  profile_collector_ = std::make_shared<ProfileCollector>(
    loop_,
    [](const ProfileCollector::ProfileQStor& data, WeakContinuousProfiler wp) {
      if (auto sp = wp.lock()) {
        // Process the profile data
        sp->on_profile_data(data);

        // If the profile has completed (empty profile data indicates end of
        // serialization)
        if (data.profile.length() == 0 && data.status == 0) {
          // Check if this is a profile completion (duration-based profile)
          uint64_t thread_id = 0;
          std::visit([&thread_id](auto& opt) {
            thread_id = opt.thread_id;
          }, data.options);
          // Notify that the profile has completed for this thread
          sp->on_profile_completed(thread_id);
        }
      }
    },
    weak_from_this());

  // Initialize thread hooks
  ASSERT_EQ(0, ThreadAddedHook(thread_added_callback, weak_from_this()));
  ASSERT_EQ(0, ThreadRemovedHook(thread_removed_callback, weak_from_this()));
}

void ContinuousProfiler::Disable() {
  nsuv::ns_mutex::scoped_lock lock(callback_mutex_);
  enabled_ = false;
}

void ContinuousProfiler::Enable(uint64_t interval_ms) {
  bool start = false;
  interval_ = interval_ms > 0 ? interval_ms : 60000;
  {
    nsuv::ns_mutex::scoped_lock lock(callback_mutex_);
    enabled_ = true;
    start = should_start();
  }

  if (start) {
    start_cpu_profiling();
  }
}

bool ContinuousProfiler::IsEnabled() {
  nsuv::ns_mutex::scoped_lock lock(callback_mutex_);
  return should_start();
}

uint64_t ContinuousProfiler::register_hook_impl(ProfileHookCallback callback) {
  if (callback == nullptr) {
    return 0;  // Invalid callback ID
  }

  uint64_t id;
  bool start = false;
  {
    // Store the callback
    nsuv::ns_mutex::scoped_lock lock(callback_mutex_);

    // Generate a unique ID for this callback inside the critical section
    id = next_callback_id_++;
    callbacks_[id] = std::move(callback);

    // Start profiling if enabled
    start = should_start();
  }

  if (start) {
    start_cpu_profiling();
  }

  return id;
}

bool ContinuousProfiler::UnregisterHook(uint64_t hook_id) {
  nsuv::ns_mutex::scoped_lock lock(callback_mutex_);
  // Erase the callback and return whether it was found
  return callbacks_.erase(hook_id) > 0;
}

/*static*/
void ContinuousProfiler::thread_added_callback(SharedEnvInst envinst,
                                               WeakContinuousProfiler wp) {
  if (auto sp = wp.lock()) {
    sp->on_thread_added(envinst);
  }
}

/*static*/
void ContinuousProfiler::thread_removed_callback(SharedEnvInst envinst,
                                                 WeakContinuousProfiler wp) {
  if (auto sp = wp.lock()) {
    sp->on_thread_removed(envinst);
  }
}

/*static*/
void ContinuousProfiler::prepare_cb(nsuv::ns_prepare*,
                                    WeakContinuousProfiler wp) {
  if (auto sp = wp.lock()) {
    sp->on_prepare();
  }
}

void ContinuousProfiler::on_prepare() {
  std::unordered_set<uint64_t> pending_threads;
  {
    nsuv::ns_mutex::scoped_lock lock(thread_mutex_);
    pending_threads = pending_threads_;
  }

  for (auto thread_id : pending_threads) {
    int result = start_cpu_profiling_for_thread(thread_id);
    if (result == 0) {
      nsuv::ns_mutex::scoped_lock lock(thread_mutex_);
      pending_threads_.erase(thread_id);
    }
  }

  {
    nsuv::ns_mutex::scoped_lock lock(thread_mutex_);
    if (pending_threads_.empty()) {
      ASSERT_EQ(0, prepare_->stop());
    }
  }
}

void ContinuousProfiler::on_thread_added(SharedEnvInst envinst) {
  uint64_t thread_id = GetThreadId(envinst);
  {
    nsuv::ns_mutex::scoped_lock lock(thread_mutex_);
    thread_ids_.insert(thread_id);
  }

  // If profiling is enabled, start profiling for this thread immediately
  if (IsEnabled()) {
    start_cpu_profiling_for_thread(thread_id);
  }
}

void ContinuousProfiler::on_thread_removed(SharedEnvInst envinst) {
  nsuv::ns_mutex::scoped_lock lock(thread_mutex_);
  uint64_t thread_id = GetThreadId(envinst);
  thread_ids_.erase(thread_id);
  currently_profiling_threads_.erase(thread_id);
  pending_threads_.erase(thread_id);
}

void ContinuousProfiler::on_profile_data(
    const ProfileCollector::ProfileQStor& data) {
  uint64_t thread_id = 0;
  std::visit([&thread_id](auto& opt) {
    thread_id = opt.thread_id;
  }, data.options);

  // Make a copy of the callbacks map while holding the lock
  std::unordered_map<uint64_t, ProfileHookCallback> callbacks;
  {
    nsuv::ns_mutex::scoped_lock lock(callback_mutex_);
    callbacks = callbacks_;
  }

  // Deliver the profile data to all registered callbacks (outside the lock)
  for (const auto& entry : callbacks) {
    entry.second(data);
  }
}

void ContinuousProfiler::start_cpu_profiling() {
  // Get a snapshot of the current thread IDs
  std::unordered_set<uint64_t> thread_ids;
  std::unordered_set<uint64_t> currently_profiling;
  {
    nsuv::ns_mutex::scoped_lock lock(thread_mutex_);
    thread_ids = thread_ids_;
    currently_profiling = currently_profiling_threads_;
  }

  // Start CPU profiling for each thread that's not already being profiled
  for (uint64_t thread_id : thread_ids) {
    // Skip threads that are already being profiled
    if (currently_profiling.find(thread_id) != currently_profiling.end()) {
      continue;
    }

    start_cpu_profiling_for_thread(thread_id);
  }
}

int ContinuousProfiler::start_cpu_profiling_for_thread(uint64_t thread_id) {
  // Create CPU profile options
  CPUProfileOptions options;
  options.thread_id = thread_id;
  options.duration = interval_;  // Use the interval as the duration
  options.start_timestamp = uv_hrtime();

  // Start CPU profiling for this thread
  int result = profile_collector_->StartCPUProfile(options);

  // If profiling started successfully, add to the currently profiling set
  if (result == 0) {
    nsuv::ns_mutex::scoped_lock lock(thread_mutex_);
    currently_profiling_threads_.insert(thread_id);
  } else {
    // add thread_id to pending_threads
    nsuv::ns_mutex::scoped_lock lock(thread_mutex_);
    pending_threads_.insert(thread_id);
    if (pending_threads_.size() == 1) {
      ASSERT_EQ(0, prepare_->start(prepare_cb, weak_from_this()));
    }
  }

  return result;
}

void ContinuousProfiler::on_profile_completed(uint64_t thread_id) {
  // Remove thread from currently profiling set
  bool thread_exists = false;
  {
    nsuv::ns_mutex::scoped_lock lock(thread_mutex_);
    currently_profiling_threads_.erase(thread_id);
    thread_exists = thread_ids_.find(thread_id) != thread_ids_.end();
  }

  // If the thread no longer exists, don't restart profiling
  if (!thread_exists) {
    return;
  }

  // If profiling is still enabled, start a new profile for this thread
  if (IsEnabled()) {
    start_cpu_profiling_for_thread(thread_id);
  }
}

}  // namespace nsolid
}  // namespace node
