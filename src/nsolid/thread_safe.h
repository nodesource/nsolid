#ifndef SRC_NSOLID_THREAD_SAFE_H_
#define SRC_NSOLID_THREAD_SAFE_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include "spinlock.h"
#include "../../deps/nsuv/include/nsuv-inl.h"

#include <algorithm>
#include <functional>
#include <list>
#include <memory>
#include <queue>

/* NSOLID_WUR -> NSOLID_WARN_UNUSED_RESULT */
#if defined(_MSC_VER) && (_MSC_VER >= 1700)
#  define NSOLID_WUR _Check_return_
#elif defined(__clang__) && __has_attribute(warn_unused_result)
#  define NSOLID_WUR __attribute__((warn_unused_result))
#elif defined(__GNUC__) && !__INTEL_COMPILER &&                                \
    (__GNUC__ > 4 || (__GNUC__ == 4 && __GNUC_MINOR__ > 0))
#  define NSOLID_WUR __attribute__((warn_unused_result))
#else
#  define NSOLID_WUR /* NOT SUPPORTED */
#endif


namespace node {
namespace nsolid {

template <typename DataType>
struct TSQueue {
  inline size_t enqueue(const DataType& data) {
    Spinlock::ScopedLock lock(lock_);
    queue_.push(data);
    return queue_.size();
  }
  inline size_t enqueue(DataType&& data) {
    Spinlock::ScopedLock lock(lock_);
    queue_.push(std::move(data));
    return queue_.size();
  }
  // NOLINTNEXTLINE(runtime/references)
  NSOLID_WUR inline bool dequeue(DataType& data) {
    Spinlock::ScopedLock lock(lock_);
    if (queue_.empty())
      return false;
    data = std::move(queue_.front());
    queue_.pop();
    return true;
  }
  // NOLINTNEXTLINE(runtime/references)
  NSOLID_WUR inline bool dequeue(DataType& data, size_t& size) {
    Spinlock::ScopedLock lock(lock_);
    if (queue_.empty())
      return false;
    data = std::move(queue_.front());
    queue_.pop();
    size = queue_.size();
    return true;
  }
  inline bool empty() {
    Spinlock::ScopedLock lock(lock_);
    return queue_.empty();
  }
  inline size_t size() {
    Spinlock::ScopedLock lock(lock_);
    return queue_.size();
  }
  inline void swap(std::queue<DataType>& other) {
    Spinlock::ScopedLock lock(lock_);
    queue_.swap(other);
  }

 private:
  std::queue<DataType> queue_;
  Spinlock lock_;
};


template <typename DataType>
struct TSQueue<DataType*> {
  inline size_t enqueue(DataType* data) {
    Spinlock::ScopedLock lock(lock_);
    queue_.push(data);
    return queue_.size();
  }
  NSOLID_WUR inline bool dequeue(DataType** data) {
    Spinlock::ScopedLock lock(lock_);
    if (queue_.empty()) {
      return false;
    }
    *data = queue_.front();
    queue_.pop();
    return true;
  }
  // NOLINTNEXTLINE(runtime/references)
  NSOLID_WUR inline bool dequeue(DataType** data, size_t& size) {
    Spinlock::ScopedLock lock(lock_);
    if (queue_.empty()) {
      return false;
    }
    *data = queue_.front();
    queue_.pop();
    size = queue_.size();
    return true;
  }
  inline bool empty() {
    Spinlock::ScopedLock lock(lock_);
    return queue_.empty();
  }
  inline size_t size() {
    Spinlock::ScopedLock lock(lock_);
    return queue_.size();
  }
  inline void swap(std::queue<DataType*>& other) {
    Spinlock::ScopedLock lock(lock_);
    queue_.swap(other);
  }

 private:
  std::queue<DataType*> queue_;
  Spinlock lock_;
};


template <typename DataType>
struct TSList {
  using iterator = typename std::list<DataType>::iterator;
  TSList() {
    int r = lock_.init(true);
    if (r != 0)
      abort();
  }
  inline iterator push_back(const DataType& data) {
    nsuv::ns_mutex::scoped_lock lock(lock_);
    list_.push_back(data);
    return --list_.end();
  }
  inline iterator push_back(DataType&& data) {
    nsuv::ns_mutex::scoped_lock lock(lock_);
    list_.push_back(std::move(data));
    return --list_.end();
  }
  inline void for_each(std::function<void(const DataType&)> fn) {
    nsuv::ns_mutex::scoped_lock lock(lock_);
    std::for_each(list_.begin(), list_.end(), fn);
  }
  inline void erase(iterator it) {
    nsuv::ns_mutex::scoped_lock lock(lock_);
    list_.erase(it);
  }
  inline size_t size() {
    nsuv::ns_mutex::scoped_lock lock(lock_);
    return list_.size();
  }

 private:
  std::list<DataType> list_;
  nsuv::ns_mutex lock_;
};


template <typename DataType>
struct TSList<DataType*> {
  using iterator = typename std::list<DataType*>::iterator;
  TSList() {
    int r = lock_.init(true);
    if (r != 0)
      abort();
  }
  inline iterator push_back(DataType* data) {
    nsuv::ns_mutex::scoped_lock lock(lock_);
    list_.push_back(data);
    return --list_.end();
  }
  inline void for_each(std::function<void(DataType*)> fn) {
    nsuv::ns_mutex::scoped_lock lock(lock_);
    std::for_each(list_.begin(), list_.end(), fn);
  }
  inline void erase(iterator it) {
    nsuv::ns_mutex::scoped_lock lock(lock_);
    list_.erase(it);
  }
  inline size_t size() {
    nsuv::ns_mutex::scoped_lock lock(lock_);
    return list_.size();
  }

 private:
  std::list<DataType*> list_;
  nsuv::ns_mutex lock_;
};

}  // namespace nsolid
}  // namespace node

#undef NSOLID_WUR

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_THREAD_SAFE_H_
