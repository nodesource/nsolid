#ifndef SRC_NSOLID_LRU_MAP_H_
#define SRC_NSOLID_LRU_MAP_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include <cassert>
#include <deque>
#include <functional>
#include <map>
#include <memory>
#include "uv.h"

namespace node {
namespace nsolid {

template <typename Key, typename Value>
class LRUMap {
  using iterator = typename std::map<Key, Value>::iterator;
  using cb_proxy_sig = void(*)(void*, Value);
  using deleter_sig = void(*)(void*);

 public:
  template <typename Cb, typename... Data>
  LRUMap(uint64_t expiry, Cb&& cb, Data&&... data): expiry_(expiry),
                                                    data_(nullptr, nullptr) {
    // NOLINTNEXTLINE(build/namespaces)
    using namespace std::placeholders;
    using G = decltype(std::bind(
      std::forward<Cb>(cb), _1, std::forward<Data>(data)...));
    // _1 - Value
    G* g = new G(std::bind(std::forward<Cb>(cb),
                           _1,
                           std::forward<Data>(data)...));
    data_ = std::unique_ptr<void, deleter_sig>(g, &delete_proxy_<G>);
    proxy_ = &cb_proxy_<G>;
  }

  inline iterator begin() {
    return map_.begin();
  }

  inline iterator end() {
    return map_.end();
  }

  inline iterator find(const Key& k) {
    return map_.find(k);
  }

  inline std::pair<iterator, bool> insert(const Key& k, const Value& v) {
    auto pair = map_.insert(std::make_pair(k, v));
    if (pair.second) {
      deque_.push_back(std::make_pair(pair.first, uv_hrtime()));
    }

    return pair;
  }

  inline std::pair<iterator, bool> insert(const Key& k, Value&& v) {
    auto pair = map_.insert(std::make_pair(k, std::move(v)));
    if (pair.second) {
      deque_.push_back(std::make_pair(pair.first, uv_hrtime()));
    }

    return pair;
  }

  inline size_t erase(const Key& k) {
    auto it = map_.find(k);
    if (it == map_.end()) {
      return 0;
    }

    for (auto i = deque_.begin(); i != deque_.end(); ++i) {
      if (i->first == it) {
        deque_.erase(i);
        break;
      }
    }

    map_.erase(it);
    return 1;
  }

  // removes entries which have already expired and call the expiration cb
  inline void clean() {
    while (!deque_.empty()) {
      auto& it = deque_.front().first;
      if ((uv_hrtime() - deque_.front().second) > expiry_) {
        proxy_(data_.get(), it->second);
        map_.erase(it);
        deque_.pop_front();
      } else {
        break;
      }
    }
  }

  inline void clear() {
    map_.clear();
    deque_.clear();
  }

  inline size_t size() const noexcept {
    assert(map_.size() == deque_.size());
    return map_.size();
  }

 private:
  template <typename G>
  static void cb_proxy_(void* g, Value v) {
    (*static_cast<G*>(g))(v);
  }

  template <typename G>
  static void delete_proxy_(void* g) {
    delete static_cast<G*>(g);
  }

  std::map<Key, Value> map_;
  std::deque<std::pair<iterator, uint64_t>> deque_;
  uint64_t expiry_;
  std::unique_ptr<void, deleter_sig> data_;
  cb_proxy_sig proxy_;
};

}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_LRU_MAP_H_
