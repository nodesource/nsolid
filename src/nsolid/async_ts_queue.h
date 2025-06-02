#ifndef SRC_NSOLID_ASYNC_TS_QUEUE_H_
#define SRC_NSOLID_ASYNC_TS_QUEUE_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include "thread_safe.h"
#include "../../deps/nsuv/include/nsuv-inl.h"
#include "asserts-cpp/asserts.h"

#include <memory>
#include <functional>
#include <tuple>
#include <type_traits>

namespace node {
namespace nsolid {

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
  template<typename Cb, typename... Args>
  static SharedAsyncTSQueue create(uv_loop_t* loop, Cb&& cb, Args&&... args) {
    SharedAsyncTSQueue queue(new AsyncTSQueue<T>(
        loop, std::forward<Cb>(cb), std::forward<Args>(args)...));
    queue->initialize();
    return queue;
  }

  /**
   * Destructor for AsyncTSQueue
   */
  ~AsyncTSQueue() {
    async_handle_->close_and_delete();
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
    if (size == 1) {
      ASSERT_EQ(0, async_handle_->send());
    }
    return size;
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
  AsyncTSQueue(uv_loop_t* loop, Cb&& cb, Args&&... args)
      : loop_(loop), async_handle_(new nsuv::ns_async()) {
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
  }

  // Static callback function for nsuv
  static void async_callback(nsuv::ns_async* handle,
                           WeakAsyncTSQueue queue_wp) {
    SharedAsyncTSQueue queue = queue_wp.lock();
    if (queue == nullptr) {
      return;
    }
    queue->process();
  }

  uv_loop_t* loop_;
  nsuv::ns_async* async_handle_;
  TSQueue<T> queue_;
  ProcessCallback process_callback_;
};

}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS
#endif  // SRC_NSOLID_ASYNC_TS_QUEUE_H_
