#ifndef AGENTS_SRC_SPAN_COLLECTOR_H_
#define AGENTS_SRC_SPAN_COLLECTOR_H_

#include <nsolid.h>
#include <nsolid/thread_safe.h>
#include <atomic>
#include <vector>
#include "nsuv-inl.h"

namespace node {
namespace nsolid {

class SpanCollector;

using SharedSpanCollector = std::shared_ptr<SpanCollector>;
using WeakSpanCollector = std::weak_ptr<SpanCollector>;
using SpanVector = std::vector<Tracer::SpanStor>;

/*
 * SpanCollector is a class that allows to start collecting spans and report
 * them to a callback function running in a specific uv_loop_t thread. The
 * collector can be configured with a minimum span count and a time interval to
 * report the spans.
 */
class SpanCollector: public std::enable_shared_from_this<SpanCollector> {
 public:
  explicit SpanCollector(uv_loop_t* loop,
                         uint32_t trace_flags,
                         size_t min_span_count,
                         uint64_t interval);
  ~SpanCollector();

  template <typename Cb, typename... Data>
  void Collect(Cb&& cb, Data&&... data) {
    // Store the callback and data
    callback_ = std::bind(std::forward<Cb>(cb),
                          std::placeholders::_1,
                          std::forward<Data>(data)...);
    this->do_collect();
  }

 private:
  void do_collect();
  void process_spans();

  uv_loop_t* loop_;
  uint32_t trace_flags_;
  size_t min_span_count_;
  std::unique_ptr<Tracer> tracer_;
  nsuv::ns_async* span_msg_;
  TSQueue<Tracer::SpanStor> span_msg_q_;
  uint64_t interval_;
  nsuv::ns_timer* span_timer_;
  std::function<void(const SpanVector&)> callback_ = nullptr;
  bool sent_ = false;
  std::atomic<bool> dropped_spans_ = false;
  bool warned_dropped_spans_ = false;
};

}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_SRC_SPAN_COLLECTOR_H_
