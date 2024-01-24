#ifndef SRC_NSOLID_NSOLID_UTIL_H_
#define SRC_NSOLID_NSOLID_UTIL_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include <algorithm>
#include <array>
#include <chrono> // NOLINT [build/c++11]
#include <cmath>
#include <iomanip>
#include <sstream>
#include <cassert>
#include <random>
#include <vector>
#include <cstring>

#include "uv.h"
#include "nlohmann/json.hpp"

using string_vector = std::vector<std::string>;
using json = nlohmann::json;


#define NSOLID_DELETE_UNUSED_CONSTRUCTORS(name)                                \
  name(const name&) = delete;                                                  \
  name(name&&) = delete;                                                       \
  name& operator=(const name&) = delete;                                       \
  name& operator=(name&&) = delete;

#define NSOLID_DELETE_DEFAULT_CONSTRUCTORS(name)                               \
  NSOLID_DELETE_UNUSED_CONSTRUCTORS(name)                                      \
  name() = delete;

#define NSOLID_UNUSED(expr) do { (void)(expr); } while (0)

namespace node {
namespace nsolid {
namespace utils {

template <typename Fn, typename... Args>
inline void (*fn2void(Fn (*fn)(Args...)))() {
  return reinterpret_cast<void(*)()>(fn);
}


inline bool are_threads_equal(uv_thread_t&& t1, uv_thread_t&& t2) {
  return uv_thread_equal(&t1, &t2);
}


inline bool find_any_fields_in_diff(const nlohmann::json& diff,
                                    const std::vector<std::string>& fields) {
  auto res = std::find_if(diff.begin(),
                          diff.end(),
                          [fields](const nlohmann::json& x) {
    auto it =
        std::find_if(fields.begin(), fields.end(), [x](const std::string& str) {
          auto it = x.find("path");
          return it != x.end() && *it == str;
        });

    return it != fields.end();
  });

  return res != diff.end();
}


inline std::string buffer_to_hex(const unsigned char* buffer, size_t len) {
  std::stringstream ss;
  for (size_t i = 0; i < len; ++i) {
    ss << std::hex << std::setw(2) << std::setfill('0')
       << static_cast<int>(static_cast<int>(buffer[i]));
  }

  return ss.str();
}


inline void generate_seed(std::array<uint64_t, 2>* state) {
  std::random_device random_device;
  std::seed_seq seed_seq{ random_device(),
                          random_device(),
                          random_device(),
                          random_device() };
  seed_seq.generate(state->begin(), state->end());
}


/*
 * xorshift+ implementation: https://en.wikipedia.org/wiki/Xorshift#xorshift+
 */
inline uint64_t generate_random() {
  static uv_once_t init_once = UV_ONCE_INIT;
  static std::array<uint64_t, 2> xorshift128p_state_;
  uv_once(&init_once, []() {
    generate_seed(&xorshift128p_state_);
  });
  uint64_t& state_a = xorshift128p_state_[0];
  uint64_t& state_b = xorshift128p_state_[1];
  uint64_t t = state_a;
  uint64_t s = state_b;
  state_a = s;
  t ^= t << 23;  // a
  t ^= t >> 17;  // b
  t ^= s ^ (s >> 26);  // c
  state_b = t;
  return t + s;
}


inline void generate_random_buf(unsigned char* buf, size_t size) {
  for (size_t i = 0; i < size; i += sizeof(uint64_t)) {
    uint64_t value = generate_random();
    if (i + sizeof(uint64_t) <= size) {
      std::memcpy(&buf[i], &value, sizeof(uint64_t));
    } else {
      std::memcpy(&buf[i], &value, size - i);
    }
  }
}


inline const std::string generate_unique_id() {
  unsigned char buf[20];
  generate_random_buf(buf, sizeof(buf));
  return buffer_to_hex(buf, sizeof(buf));
}


inline uint64_t ms_since_epoch() {
  using std::chrono::duration_cast;
  using std::chrono::milliseconds;
  using std::chrono::system_clock;
  system_clock::duration dur = system_clock::now().time_since_epoch();
  return duration_cast<milliseconds>(dur).count();
}


inline std::vector<std::string> split(const std::string& str,
                                      const char d,
                                      size_t reserve = 0) {
  std::vector<std::string> res;
  if (reserve)
    res.reserve(reserve);

  const char* ptr = str.data();
  size_t size = 0;

  for (const char c : str) {
    if (c == d) {
      res.emplace_back(ptr, size);
      ptr += size + 1;
      size = 0;
      continue;
    }
    ++size;
  }

  if (size) {
    res.emplace_back(ptr, size);
  }

  return res;
}


class ring_buffer {
 public:
  NSOLID_DELETE_DEFAULT_CONSTRUCTORS(ring_buffer)
  explicit ring_buffer(size_t s) : size_(s),
                                   buffer_(s) {
  }

  void push_back(double n) {
    buffer_[idx_] = n;
    idx_ = (idx_ + 1) % size_;
    if (len_ < size_) len_++;
  }

  double percentile(double p) {
    if (p > 1 || p < 0)
      return 0;
    const auto n_it = buffer_.begin() + len_ * p;
    std::nth_element(buffer_.begin(), n_it, buffer_.end());
    return *n_it;
  }

 private:
  size_t idx_ = 0;
  size_t len_ = 0;
  const size_t size_;
  std::vector<double> buffer_;
};

template <typename T>
class RingBuffer {
 public:
  NSOLID_DELETE_DEFAULT_CONSTRUCTORS(RingBuffer)
  explicit RingBuffer(size_t s)
      : capacity_(s),
        size_(0),
        head_(0),
        tail_(0) {
    buffer_ = new T[s];
  }

  ~RingBuffer() {
    delete[] buffer_;
  }

  bool empty() const {
    return size_ == 0;
  }

  // Make sure to check empty() first otherwise an invalid value will be
  // returned.
  T& front() {
    return buffer_[head_];
  }

  void pop() {
    if (empty())
      return;
    head_ = (head_ + 1) % capacity_;
    size_--;
  }

  void push(T& value) {
    buffer_[tail_] = value;
    tail_ = (tail_ + 1) % capacity_;

    if (size_ == capacity_)
      head_ = (head_ + 1) % capacity_;
    else
      size_++;
  }

  void push(T&& value) {
    buffer_[tail_] = value;
    tail_ = (tail_ + 1) % capacity_;

    if (size_ == capacity_)
      head_ = (head_ + 1) % capacity_;
    else
      size_++;
  }

 private:
  T* buffer_;
  const size_t capacity_;
  size_t size_;
  size_t head_;
  size_t tail_;
};

}  // namespace utils
}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_NSOLID_UTIL_H_
