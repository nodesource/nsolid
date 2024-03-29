#include "nsolid_api.h"
#include "nsolid_trace.h"
#include "nsolid_util.h"
#include "env-inl.h"
#include "node_internals.h"

#define NANOS_PER_SEC 1000000000

namespace node {
namespace nsolid {
namespace tracing {

constexpr uint64_t span_item_q_interval = 100;
constexpr size_t span_item_q_max_size = 100;

/*static*/
const char* Span::traceTypeToString(const Tracer::SpanType& type) {
  switch (type) {
#define V(Enum, Val, Str)                                                      \
    case Tracer::Enum:                                                     \
      return #Str;
  NSOLID_SPAN_TYPES(V)
#undef V
  }

  return nullptr;
}


Span::Span(uint64_t thread_id) {
  stor_.parent_id = "0000000000000000";
  stor_.start = 0;
  stor_.end = 0;
  stor_.kind = Tracer::kInternal;
  stor_.type = Tracer::kSpanNone;
  stor_.status_code = Tracer::kUnset;
  stor_.end_reason = Tracer::kSpanEndOk;
  stor_.attrs = "{ ";
  stor_.thread_id = thread_id;
}


void Span::add_prop(const SpanPropBase& prop) {
  static double performance_process_start_timestamp =
    performance::performance_process_start_timestamp / 1e3;
  switch (prop.type()) {
    case Span::kSpanStart:
    {
      stor_.start = performance_process_start_timestamp + prop.val<double>();
    }
    break;
    case Span::kSpanOtelIds:
    {
      auto res = utils::split(prop.val<std::string>(), ':', 3);
      size_t size = res.size();
      DCHECK(size == 2 || size == 3);
      stor_.trace_id = res[0];
      stor_.span_id = res[1];
      if (size == 3) {
        stor_.parent_id = res[2];
      }
    }
    break;
    case Span::kSpanEnd:
    {
      stor_.end = performance_process_start_timestamp + prop.val<double>();
    }
    break;
    case Span::kSpanName:
    {
      stor_.name = prop.val<std::string>();
    }
    break;
    case Span::kSpanEndReason:
    {
      stor_.end_reason =
        static_cast<Tracer::EndReason>(prop.val<uint64_t>());
    }
    break;
    case Span::kSpanKind:
    {
      stor_.kind = static_cast<Tracer::SpanKind>(prop.val<uint64_t>());
    }
    break;
    case Span::kSpanType:
    {
      stor_.type = static_cast<Tracer::SpanType>(prop.val<uint64_t>());
    }
    break;
    case Span::kSpanStatusCode:
    {
      stor_.status_code =
        static_cast<Tracer::SpanStatusCode>(prop.val<uint64_t>());
    }
    break;
    case Span::kSpanStatusMsg:
    {
      stor_.status_msg = prop.val<std::string>();
    }
    break;
    case kSpanCustomAttrs:
      stor_.extra_attrs.push_back(prop.val<std::string>());
    break;
    case kSpanEvent:
      stor_.events.push_back(prop.val<std::string>());
    break;
    default:
      add_attribute(prop);
  }
}


void Span::add_attribute(const SpanPropBase& prop) {
  switch (prop.type()) {
#define V(Enum, Type, CName, JSName)                                           \
    case Enum:                                                                 \
      stor_.attrs += "\""#JSName"\":";                                         \
      stor_.attrs += std::to_string(prop.val<uint64_t>());                     \
    break;
  NSOLID_SPAN_ATTRS_NUMBERS(V)
#undef V
#define V(Enum, Type, CName, JSName)                                           \
    case Enum:                                                                 \
      stor_.attrs += "\""#JSName"\":";                                         \
      stor_.attrs += "\"" + prop.val<Type>() + "\"" ;                          \
    break;
  NSOLID_SPAN_ATTRS_STRINGS(V)
#undef V
#define V(Enum, Type, CName, JSName)                                           \
    case Enum:                                                                 \
      stor_.attrs += "\""#JSName"\":";                                         \
      stor_.attrs += prop.val<Type>();                                         \
    break;
  NSOLID_SPAN_DNS_ATTRS_JSON_STRINGS(V)
#undef V
    default:
      // Here should go custom attributes
      return;
  }

  stor_.attrs += ",";
}


Tracer::SpanType Span::type() const {
  return stor_.type;
}


TracerImpl::TracerImpl():
    pending_spans_(5UL * 60UL * NANOS_PER_SEC, expired_span_cb_, this) {
}

TSList<TracerImpl::TraceHookStor>::iterator TracerImpl::addHook(
    uint32_t flags,
    Tracer* tracer,
    void* data,
    Tracer::tracer_proxy_sig cb,
    internal::deleter_sig deleter) {
  ts_trace_flags_.fetch_or(flags);
  update_flags();
  return trace_hook_list_.push_back(
    { flags, tracer, cb, nsolid::internal::user_data(data, deleter) });
}


void TracerImpl::addSpanItem(const SpanItem& item) {
  auto it = pending_spans_.find(item.span_id);
  if (it == pending_spans_.end()) {
    if (item.prop->type() != Span::kSpanStart) {
      // This condition can only happen when the span in pending_spans_
      // expired. Just ignore the remaining items.
      return;
    }

    Span span(item.thread_id);
    auto pair = pending_spans_.insert(item.span_id, std::move(span));
    CHECK(pair.second);
    it = pair.first;
  }

  Span& span = it->second;
  span.add_prop(*item.prop);
  if (span.stor_.end != 0) {
    DCHECK(item.prop->type() == Span::kSpanEnd);
    span.stor_.attrs.pop_back();
    span.stor_.attrs += "}";
    trace_hook_list_.for_each([&](auto& stor) {
      if (stor.flags & span.type()) {
        stor.cb(stor.tracer, span.stor_, stor.data.get());
      }
    });

    pending_spans_.erase(item.span_id);
    pending_spans_.clean();
  }
}

void TracerImpl::endPendingSpans() {
  int r = nsolid::QueueCallback(+[](TracerImpl* tracer) {
    double now = GetCurrentTimeInMicroseconds() / 1000;
    for (auto& item : tracer->pending_spans_) {
      auto& span = item.second;
      span.stor_.end_reason = Tracer::kSpanEndExit;
      span.stor_.end = now;
      span.stor_.attrs.pop_back();
      span.stor_.attrs += "}";
      tracer->trace_hook_list_.for_each([&](auto& stor) {
        if (stor.flags & span.type()) {
          stor.cb(stor.tracer, span.stor_, stor.data.get());
        }
      });
    }

    tracer->pending_spans_.clear();
  }, this);
  if (r != 0) {
    // Nothing to do here
  }
}

void TracerImpl::pushSpanData(SpanItem&& item) {
  std::string thread_name;
  uint32_t tid;
  uint64_t thread_id = item.thread_id;
  bool send_thread_name = item.prop->type() == Span::kSpanStart;
  if (send_thread_name) {
    auto envinst_sp = GetEnvInst(thread_id);
    if (envinst_sp != nullptr) {
      thread_name = envinst_sp->GetThreadName();
      send_thread_name &= thread_name.size() > 0;
    }
  }

  if (send_thread_name) {
    tid = item.span_id;
  }

  EnvList* envlist = EnvList::Inst();
  envlist->send_trace_data(std::move(item));
  if (send_thread_name) {
    auto prop = Span::createSpanProp<std::string>(Span::kSpanThreadName,
                                                  thread_name);
    item = SpanItem { tid, thread_id, std::move(prop) };
    envlist->send_trace_data(std::move(item));
  }
}


void TracerImpl::removeHook(TSList<TraceHookStor>::iterator it) {
  trace_hook_list_.erase(it);
  // recalculate trace_flags_ after removing the hook
  uint32_t flags = 0;
  trace_hook_list_.for_each([&flags](auto& stor) {
    flags |= stor.flags;
  });

  ts_trace_flags_.store(flags);
  update_flags();
}


// To safely update the trace_flags_ check in which thread we're in. If in
// EnvList thread, update it right away
void TracerImpl::update_flags() {
  uint32_t flags = ts_trace_flags_.load();
  EnvList* envlist = EnvList::Inst();
  envlist->UpdateTracingFlags(flags);

  if (flags) {
    CHECK_EQ(envlist->span_item_q_.Start(span_item_q_interval,
                                         span_item_q_max_size,
                                         get_trace_item_cb_), 0);
  }
}


void TracerImpl::expired_span_cb_(Span span, TracerImpl* tracer) {
  span.stor_.end_reason = Tracer::kSpanEndExpired;
  span.stor_.end = GetCurrentTimeInMicroseconds() / 1000;
  span.stor_.attrs.pop_back();
  span.stor_.attrs += "}";
  tracer->trace_hook_list_.for_each([&](auto& stor) {
    if (stor.flags & span.type()) {
      stor.cb(stor.tracer, std::move(span.stor_), stor.data.get());
    }
  });
}


void TracerImpl::get_trace_item_cb_(std::queue<tracing::SpanItem>&& q) {
  EnvList* envlist = EnvList::Inst();
  DCHECK(utils::are_threads_equal(uv_thread_self(), envlist->thread()));
  if (q.empty()) {
    return;
  }

  auto tracer = envlist->GetTracer();
  while (!q.empty()) {
    SpanItem&& item = std::move(q.front());
    tracer->addSpanItem(item);
    q.pop();
  }
}

}  // namespace tracing
}  // namespace nsolid
}  // namespace node
