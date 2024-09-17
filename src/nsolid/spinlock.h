#ifndef SRC_NSOLID_SPINLOCK_H_
#define SRC_NSOLID_SPINLOCK_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include <atomic>

namespace node {
namespace nsolid {

class Spinlock {
 public:
  void lock() const {
    while (locked_.test_and_set(std::memory_order_acquire)) {}
  }
  void unlock() const {
    locked_.clear(std::memory_order_release);
  }
  class ScopedLock {
   public:
    ScopedLock() = delete;
    ScopedLock(const ScopedLock&) = delete;
    ScopedLock(ScopedLock&&) = delete;
    ScopedLock& operator=(const ScopedLock&) = delete;
    ScopedLock& operator=(ScopedLock&&) = delete;
    inline explicit ScopedLock(Spinlock* sl) : spinlock_(*sl) {
      spinlock_.lock();
    }
    inline explicit ScopedLock(const Spinlock& sl) : spinlock_(sl) {
      spinlock_.lock();
    }
    inline ~ScopedLock() {
      spinlock_.unlock();
    }

   private:
    const Spinlock& spinlock_;
  };

 private:
  mutable std::atomic_flag locked_ = ATOMIC_FLAG_INIT;
};

}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_SPINLOCK_H_
