#ifndef SRC_NSOLID_LRU_MAP_H_
#define SRC_NSOLID_LRU_MAP_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include <cassert>
#include <functional>
#include <iterator>
#include <list>
#include <memory>
#include <unordered_map>
#include <utility>
#include "uv.h"

namespace node {
namespace nsolid {

template <typename Key, typename Value>
class LRUMap {
  // An entry is the key/value pair plus the time it was inserted.
  struct Entry : std::pair<const Key, Value> {
    template <typename V>
    Entry(const Key& k, V&& v, uint64_t t)
        : std::pair<const Key, Value>(k, std::forward<V>(v)), time(t) {}
    uint64_t time;
  };

  // The entries, oldest first. index_ finds a key's entry.
  using entry_list = std::list<Entry>;
  using iterator = typename entry_list::iterator;
  using cb_proxy_sig = void(*)(void*, Value);
  using deleter_sig = void(*)(void*);

 public:
  template <typename Cb, typename... Data>
  LRUMap(uint64_t expiry, Cb&& cb, Data&&... data): expiry_(expiry),
                                                    data_(nullptr, nullptr) {
    // NOLINTNEXTLINE(build/namespaces)
    using std::placeholders::_1;
    using G = decltype(std::bind(
      std::forward<Cb>(cb), _1, std::forward<Data>(data)...));
    // _1 - Value
    G* g = new G(std::bind(std::forward<Cb>(cb),
                           _1,
                           std::forward<Data>(data)...));
    data_ = std::unique_ptr<void, deleter_sig>(g, &delete_proxy_<G>);
    proxy_ = &cb_proxy_<G>;
  }

  // Holds at most max_size entries: an insert past it hands the oldest to the
  // expiry callback, as if it had expired. 0, the default, means no limit.
  inline void set_max_size(size_t max_size) { max_size_ = max_size; }

  inline iterator begin() { return entries_.begin(); }

  inline iterator end() { return entries_.end(); }

  inline iterator find(const Key& k) {
    auto it = index_.find(k);
    return it == index_.end() ? entries_.end() : it->second;
  }

  inline std::pair<iterator, bool> insert(const Key& k, const Value& v) {
    return add(k, v);
  }

  inline std::pair<iterator, bool> insert(const Key& k, Value&& v) {
    return add(k, std::move(v));
  }

  inline size_t erase(const Key& k) {
    auto it = index_.find(k);
    if (it == index_.end()) {
      return 0;
    }

    entries_.erase(it->second);
    index_.erase(it);
    return 1;
  }

  // removes entries which have already expired and call the expiration cb
  inline void clean() {
    if (entries_.empty()) {
      return;
    }

    uint64_t now = uv_hrtime();
    // expiry_ is minutes at most, so time + expiry_ doesn't overflow.
    while (!entries_.empty() && entries_.front().time + expiry_ < now) {
      expire_oldest();
    }
  }

  inline void clear() {
    entries_.clear();
    index_.clear();
  }

  inline size_t size() const noexcept {
    assert(entries_.size() == index_.size());
    return entries_.size();
  }

 private:
  template <typename V>
  inline std::pair<iterator, bool> add(const Key& k, V&& v) {
    auto found = index_.find(k);
    if (found != index_.end()) {
      return {found->second, false};
    }

    iterator it =
        entries_.emplace(entries_.end(), k, std::forward<V>(v), uv_hrtime());
    index_.emplace(k, it);
    if (max_size_ != 0 && entries_.size() > max_size_) {
      expire_oldest();
    }

    return {it, true};
  }

  inline void expire_oldest() {
    iterator it = entries_.begin();
    Value value = std::move(it->second);
    index_.erase(it->first);
    entries_.erase(it);
    proxy_(data_.get(), std::move(value));
  }

  template <typename G>
  static void cb_proxy_(void* g, Value v) {
    (*static_cast<G*>(g))(std::move(v));
  }

  template <typename G>
  static void delete_proxy_(void* g) {
    delete static_cast<G*>(g);
  }

  entry_list entries_;
  std::unordered_map<Key, iterator> index_;
  uint64_t expiry_;
  size_t max_size_ = 0;
  std::unique_ptr<void, deleter_sig> data_;
  cb_proxy_sig proxy_;
};

}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_LRU_MAP_H_
