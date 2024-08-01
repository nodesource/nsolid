#ifndef AGENTS_SRC_SPAN_COLLECTOR_H_
#define AGENTS_SRC_SPAN_COLLECTOR_H_

#include <nsolid.h>
#include <nsolid/thread_safe.h>
#include "nsuv-inl.h"
#include <vector>

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
 * report the spans. In addition, the collector can be configured with a
 * transform function that will be applied to the spans before calling the final
 * callback.
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

  template <typename Transform, typename Cb, typename... Data>
  void CollectAndTransform(Transform&& transform, Cb&& cb, Data&&... data) {
    // Store the transform function and callback
    auto data_tuple = std::make_tuple(std::forward<Data>(data)...);
    transform_callback_ = [transform = std::forward<Transform>(transform),
                           cb = std::forward<Cb>(cb),
                           data_tuple] (const SpanVector& spans) {
      // Create a vector for transformed spans
      using TransformedType =
          decltype(transform(std::declval<Tracer::SpanStor>(),
                             std::declval<Data>()...));
      std::vector<TransformedType> transformed_spans;
      transformed_spans.reserve(spans.size());

      // Apply the transform to each span
      std::apply([&transform, &spans, &transformed_spans](const Data&... data) {
        for (const auto& span : spans) {
          transformed_spans.push_back(transform(span, data...));
        }
      }, data_tuple);

      // Call the callback with the transformed spans and additional data
      std::apply([&cb, &transformed_spans](const Data&... data) {
        cb(transformed_spans, data...);
      }, data_tuple);
    };
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
  std::function<void(const SpanVector&)> transform_callback_ = nullptr;
};

}  // namespace nsolid
}  // namespace node

#endif  // AGENTS_SRC_SPAN_COLLECTOR_H_
