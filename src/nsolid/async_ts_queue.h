#ifndef SRC_NSOLID_ASYNC_TS_QUEUE_H_
#define SRC_NSOLID_ASYNC_TS_QUEUE_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include "thread_safe.h"
#include "../../deps/nsuv/include/nsuv-inl.h"
#include "asserts-cpp/asserts.h"

#include <memory>
#include <functional>
#include <tuple>

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
  using ProcessCallback = std::function<void(T&&)>;

  /**
   * Factory method to create and initialize an AsyncTSQueue
   *
   * @param loop The UV loop to use for async notifications
   * @param callback The callback to process items
   * @return A shared pointer to the initialized AsyncTSQueue
   */
  template<typename Cb, typename... Args>
  static SharedAsyncTSQueue create(uv_loop_t* loop, Cb&& cb, Args&&... args) {
    // Create a shared_ptr with the private constructor
    SharedAsyncTSQueue queue(new AsyncTSQueue<T>(
        loop, std::forward<Cb>(cb), std::forward<Args>(args)...));

    // Initialize the queue and return it
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
   * Enqueue an item to the queue
   *
   * @param item The item to enqueue
   * @return The current size of the queue after enqueuing
   */
  size_t enqueue(const T& item) {
    size_t size = queue_.enqueue(item);
    ASSERT_EQ(0, async_handle_->send());
    return size;
  }

  /**
   * Enqueue an item to the queue using move semantics
   *
   * @param item The item to enqueue
   * @return The current size of the queue after enqueuing
   */
  size_t enqueue(T&& item) {
    size_t size = queue_.enqueue(std::move(item));
    ASSERT_EQ(0, async_handle_->send());
    return size;
  }

  /**
   * Process all items in the queue
   */
  void process() {
    process_single_items();
  }

 private:
  /**
   * Constructor for AsyncTSQueue
   *
   * @param loop The UV loop to use for async notifications
   * @param callback The callback to process items
   */
  template<typename Cb, typename... Args>
  AsyncTSQueue(uv_loop_t* loop, Cb&& cb, Args&&... args)
      : loop_(loop),
        async_handle_(new nsuv::ns_async()) {
    // Create a lambda that captures the callback and arguments by value
    // and forwards them when called
    process_callback_ = [cb = std::forward<Cb>(cb),
                         args_tuple = std::make_tuple(
                             std::forward<Args>(args)...)]
                         (T&& item) mutable {
      // Apply the callback with the item and stored arguments
      std::apply([&cb, &item](auto&&... args) {
        cb(std::forward<T>(item), std::forward<decltype(args)>(args)...);
      }, args_tuple);
    };
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

  /**
   * Process items one by one using the process_callback_
   */
  void process_single_items() {
    T item;
    while (queue_.dequeue(item)) {
      process_callback_(std::move(item));
    }
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
