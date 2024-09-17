#include "span_collector.h"
#include "asserts-cpp/asserts.h"

namespace node {
namespace nsolid {

SpanCollector::SpanCollector(uv_loop_t* loop,
                             uint32_t trace_flags,
                             size_t min_span_count,
                             uint64_t interval):
    loop_(loop),
    trace_flags_(trace_flags),
    min_span_count_(min_span_count),
    span_msg_(new nsuv::ns_async()),
    interval_(interval),
    span_timer_(new nsuv::ns_timer()) {
}

SpanCollector::~SpanCollector() {
  span_timer_->close_and_delete();
  span_msg_->close_and_delete();
}

void SpanCollector::do_collect() {
  // Create the instance with a callback that enqueues spans and sends a message
  Tracer* tracer = Tracer::CreateInstance(
    trace_flags_,
    +[](Tracer*, Tracer::SpanStor span, WeakSpanCollector collector_wp) {
      SharedSpanCollector collector = collector_wp.lock();
      if (collector == nullptr) {
        return;
      }

      // Only notify the loop_ thread if the queue reaches min_span_count_to
      // avoid too many uv_async_t::send() calls.
      if (collector->span_msg_q_.enqueue(span) > collector->min_span_count_) {
        ASSERT_EQ(0, collector->span_msg_->send());
      }
    },
    weak_from_this());
  ASSERT_NOT_NULL(tracer);
  tracer_.reset(tracer);

  int er = span_msg_->init(
    loop_,
    +[](nsuv::ns_async*, WeakSpanCollector collector_wp) {
      SharedSpanCollector collector = collector_wp.lock();
      if (collector == nullptr) {
        return;
      }

      collector->process_spans();
    },
    weak_from_this());
  ASSERT_EQ(0, er);
  er = span_timer_->init(loop_);
  ASSERT_EQ(0, er);
  er = span_timer_->start(+[](nsuv::ns_timer*,
                              WeakSpanCollector collector_wp) {
    SharedSpanCollector collector = collector_wp.lock();
    if (collector == nullptr) {
      return;
    }

    collector->process_spans();
  }, 0, interval_, weak_from_this());
  ASSERT_EQ(0, er);
}

void SpanCollector::process_spans() {
  Tracer::SpanStor span;
  SpanVector spans;
  while (span_msg_q_.dequeue(span)) {
    spans.push_back(std::move(span));
  }

  // After processing, call the stored callback with the spans and additional
  // data.
  if (spans.size()) {
    if (transform_callback_) {
      transform_callback_(spans);
    } else {
      callback_(spans);
    }
  }
}

}  // namespace nsolid
}  // namespace node
