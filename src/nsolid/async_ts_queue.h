#ifndef SRC_NSOLID_ASYNC_TS_QUEUE_H_
#define SRC_NSOLID_ASYNC_TS_QUEUE_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include "thread_safe.h"
#include "../../deps/nsuv/include/nsuv-inl.h"
#include "asserts-cpp/asserts.h"

#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
#include <vector>
#include <tuple>
#include <type_traits>

namespace node {
namespace nsolid {

/**
 * Options for AsyncTSQueue batching notification
 */
struct AsyncTSQueueOptions {
  uint64_t min_size = 0;  // Minimum queue size to trigger notification
  uint64_t max_time = 0;  // Maximum time (ms) before notification
};


/**
 * AsyncTSQueue is a templated class that provides an asynchronous thread-safe queue.
 * It abstracts away the common functionality found all around N|Solid
 * for managing a thread-safe queue with async notification to a UV loop.
 *
 * @tparam T The type of data to be stored in the queue
 */
template <typename T>
class AsyncTSQueue : public std::enable_shared_from_this<AsyncTSQueue<T>> {
 public:
  using SharedAsyncTSQueue = std::shared_ptr<AsyncTSQueue<T>>;
  using WeakAsyncTSQueue = std::weak_ptr<AsyncTSQueue<T>>;

  /**
   * Factory method to create and initialize an AsyncTSQueue
   *
   * @param loop The UV loop to use for async notifications
   * @param callback The callback to process items
   * @return A shared pointer to the initialized AsyncTSQueue
   */
  // Factory method for options-based batching
  template<typename Cb, typename... Args>
  static SharedAsyncTSQueue create(uv_loop_t* loop,
                                   const AsyncTSQueueOptions& opts,
                                   Cb&& cb,
                                   Args&&... args) {
    SharedAsyncTSQueue queue(new AsyncTSQueue<T>(
        loop, opts, std::forward<Cb>(cb), std::forward<Args>(args)...));
    queue->initialize();
    return queue;
  }

  // Factory method for legacy behavior
  template<typename Cb, typename... Args>
  static SharedAsyncTSQueue create(uv_loop_t* loop, Cb&& cb, Args&&... args) {
    const AsyncTSQueueOptions opts;
    SharedAsyncTSQueue queue(new AsyncTSQueue<T>(
        loop, opts, std::forward<Cb>(cb), std::forward<Args>(args)...));
    queue->initialize();
    return queue;
  }

  /**
   * Destructor for AsyncTSQueue
   */
  ~AsyncTSQueue() {
    async_handle_->close_and_delete();
    async_handle_ = nullptr;
    if (timer_) {
      timer_->close_and_delete();
      timer_ = nullptr;
    }
  }

  /**
   * Enqueue an item to the queue (copy or move)
   *
   * @param item The item to enqueue
   * @return The current size of the queue after enqueuing
   */
  size_t enqueue(const T& item) {
    return enqueue_impl(item);
  }

  size_t enqueue(T&& item) {
    return enqueue_impl(std::move(item));
  }

 private:
  // DRY helper for enqueue logic
  template<typename U>
  size_t enqueue_impl(U&& item) {
    size_t size = queue_.enqueue(std::forward<U>(item));
    if (batching_enabled_) {
      if (size == 1) {
        // Arm the timer for the async callback
        if (!timer_armed_.exchange(true, std::memory_order_release)) {
          trigger_async();
        }
      } else if (size >= opts_.min_size) {
        // Make sure we don't arm the timer if min size is reached, so we're
        // items are consumed in the async callback.
        timer_armed_.store(false, std::memory_order_release);
        trigger_async();
      }
    } else {
      if (size == 1) {
        ASSERT_EQ(0, async_handle_->send());
      }
    }
    return size;
  }

  // Timer management
  void start_timer() {
    ASSERT_NOT_NULL(timer_);
    ASSERT_EQ(0, timer_->start(+[](nsuv::ns_timer*, WeakAsyncTSQueue queue_wp) {
      SharedAsyncTSQueue queue = queue_wp.lock();
      if (queue == nullptr) {
        return;
      }

      queue->trigger_async();
    }, opts_.max_time, 0, this->weak_from_this()));
  }

  void trigger_async() {
    ASSERT_EQ(0, async_handle_->send());
  }

  /**
   * Process all items in the queue
   * 
   * Calls the appropriate callback based on the callback type (single or batch)
   * determined at compile time using if constexpr.
   */
  void process() {
    process_callback_();
  }

 private:
  // Callback support for both single-item and batch processing
  using ProcessCallback = std::function<void()>;
  // --- Type traits for Callback Type Detection ---
  template <typename Cb, typename... Extra>
  using is_batch_callback = std::disjunction<
      std::is_invocable<Cb, std::vector<T>&&, Extra...>,
      std::is_invocable<Cb, const std::vector<T>&, Extra...>
  >;
  template <typename Cb, typename... Extra>
  using is_single_callback = std::disjunction<
      std::is_invocable<Cb, T&&, Extra...>,
      std::is_invocable<Cb, const T&, Extra...>
  >;

  /**
   * Constructor for AsyncTSQueue
   *
   * Uses if constexpr with type traits to select between single-item and batch
   * callback logic at compile time.
   */
  template<typename Cb, typename... Args>
  AsyncTSQueue(uv_loop_t* loop,
               const AsyncTSQueueOptions& opts,
               Cb&& cb,
               Args&&... args)
    : loop_(loop),
      async_handle_(new nsuv::ns_async()),
      opts_(opts),
      batching_enabled_(opts.min_size > 0 && opts.max_time > 0),
      timer_(nullptr) {
    setup_callback(std::forward<Cb>(cb), std::forward<Args>(args)...);
  }

  // Setup callback and timer logic
  template<typename Cb, typename... Args>
  void setup_callback(Cb&& cb, Args&&... args) {
    // Create a bound callback function
    auto bound_cb = [cb = std::forward<Cb>(cb),
                     ...args = std::forward<Args>(args)](auto&& first) mutable {
      std::invoke(cb, std::forward<decltype(first)>(first), args...);
    };
    if constexpr (is_batch_callback<Cb, Args...>::value) {
      // Batch callback: process all items at once
      process_callback_ = [this, bound_cb = bound_cb]() mutable {
        T item;
        size_t size = queue_.dequeue(item);
        if (size > 0) {
          std::vector<T> batch;
          batch.reserve(size + 1);
          batch.push_back(std::move(item));
          while (queue_.dequeue(item)) {
            batch.push_back(std::move(item));
          }
          bound_cb(std::move(batch));
        }
      };
    } else if constexpr (is_single_callback<Cb, Args...>::value) {
      process_callback_ = [this, bound_cb = bound_cb]() mutable {
        T item;
        while (queue_.dequeue(item)) {
          bound_cb(std::move(item));
        }
      };
    } else {
      static_assert(is_batch_callback<Cb, Args...>::value ||
                    is_single_callback<Cb, Args...>::value,
                    "AsyncTSQueue callback signature not supported");
    }
  }

  /**
   * Initialize the async handle
   * Must be called after the shared_ptr is fully constructed
   */
  void initialize() {
    // Initialize the async handle with a weak pointer to this object
    WeakAsyncTSQueue weak_this = this->weak_from_this();
    ASSERT_EQ(0, async_handle_->init(loop_, async_callback, weak_this));
    if (batching_enabled_) {
      timer_ = new nsuv::ns_timer();
      ASSERT_EQ(0, timer_->init(loop_));
    }
  }

  /**
   * Note on batching behavior: This implementation ensures process() is called
   * exactly once per batch. If new items are enqueued during process(), the timer
   * is not automatically re-armed. The timer will only be re-armed when the queue
   * becomes empty and then receives a new item (size == 1 path in enqueue_impl).
   * This differs from level-triggered queues and may introduce a delay in processing
   * new items if they arrive during an ongoing batch processing.
   */
  static void async_callback(nsuv::ns_async* handle,
                             WeakAsyncTSQueue queue_wp) {
    SharedAsyncTSQueue queue = queue_wp.lock();
    if (queue == nullptr) {
      return;
    }
    if (queue->batching_enabled_) {
      // Only start timer if it was armed and queue is not empty
      if (queue->timer_armed_.exchange(false, std::memory_order_acquire) &&
          !queue->queue_.empty()) {
        queue->start_timer();
        return;
      }
    }

    queue->process();
  }

  uv_loop_t* loop_;
  nsuv::ns_async* async_handle_;
  TSQueue<T> queue_;
  ProcessCallback process_callback_;

  // Batching options and timer
  AsyncTSQueueOptions opts_;
  const bool batching_enabled_ = false;
  nsuv::ns_timer* timer_;
  std::atomic<bool> timer_armed_{false};
};

}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS
#endif  // SRC_NSOLID_ASYNC_TS_QUEUE_H_
