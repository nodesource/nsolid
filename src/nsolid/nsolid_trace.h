#ifndef SRC_NSOLID_NSOLID_TRACE_H_
#define SRC_NSOLID_NSOLID_TRACE_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include <array>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include "lru_map.h"
#include "nsolid.h"
#include "thread_safe.h"

namespace node {
namespace nsolid {
// Predefinitions
class EnvInst;

namespace tracing {

#define NSOLID_SPAN_DNS_TYPES(V)                                               \
  V(kDnsLookup)                                                                \
  V(kDnsLookupService)                                                         \
  V(kDnsResolve)                                                               \
  V(kDnsReverse)

#define NSOLID_SPAN_PROP_TYPES_STRINGS(V)                                      \
  V(kSpanCustomAttrs)                                                          \
  V(kSpanEvent)                                                                \
  V(kSpanOtelIds)                                                              \
  V(kSpanName)                                                                 \
  V(kSpanStatusMsg)

#define NSOLID_SPAN_PROP_TYPES_NUMBERS(V)                                      \
  V(kSpanStart)                                                                \
  V(kSpanEnd)                                                                  \
  V(kSpanEndReason)                                                            \
  V(kSpanKind)                                                                 \
  V(kSpanStatusCode)                                                           \
  V(kSpanType)

#define NSOLID_SPAN_BASE_ATTRS_STRINGS(V)                                      \
  V(kSpanThreadName, std::string, thread_name, thread.name)

#define NSOLID_SPAN_BASE_ATTRS_NUMBERS(V)                                      \
  V(kSpanThreadId, uint64_t, thread_id, thread.id)

#define NSOLID_SPAN_BASE_ATTRS(V)                                              \
  NSOLID_SPAN_BASE_ATTRS_STRINGS(V)                                            \
  NSOLID_SPAN_BASE_ATTRS_NUMBERS(V)

#define NSOLID_SPAN_DNS_ATTRS_STRINGS(V)                                       \
  V(kSpanDnsHostname, std::string, hostname, dns.hostname)                     \
  V(kSpanDnsRRType, std::string, rr_type, dns.rrtype)

#define NSOLID_SPAN_DNS_ATTRS_JSON_STRINGS(V)                                  \
  V(kSpanDnsAddress, std::string, address, dns.address)

#define NSOLID_SPAN_DNS_ATTRS_NUMBERS(V)                                       \
  V(kSpanDnsOpType, Span::DnsOpType, op_type, dns.op_type)                     \
  V(kSpanDnsPort, uint64_t, port, dns.port)

#define NSOLID_SPAN_DNS_ATTRS(V)                                               \
  NSOLID_SPAN_DNS_ATTRS_STRINGS(V)                                             \
  NSOLID_SPAN_DNS_ATTRS_JSON_STRINGS(V)                                        \
  NSOLID_SPAN_DNS_ATTRS_NUMBERS(V)

#define NSOLID_SPAN_HTTP_ATTRS_STRINGS(V)                                      \
  V(kSpanHttpMethod, std::string, method, http.method)                         \
  V(kSpanHttpReqUrl, std::string, req_url, http.url)                           \
  V(kSpanHttpStatusMessage, std::string, status_text, http.status_text)

#define NSOLID_SPAN_HTTP_ATTRS_NUMBERS(V)                                      \
  V(kSpanHttpStatusCode, uint64_t, status_code, http.status_code)

#define NSOLID_SPAN_HTTP_ATTRS(V)                                              \
  NSOLID_SPAN_HTTP_ATTRS_STRINGS(V)                                            \
  NSOLID_SPAN_HTTP_ATTRS_NUMBERS(V)

#define NSOLID_SPAN_ATTRS(V)                                                   \
  NSOLID_SPAN_BASE_ATTRS(V)                                                    \
  NSOLID_SPAN_DNS_ATTRS(V)                                                     \
  NSOLID_SPAN_HTTP_ATTRS(V)

#define NSOLID_SPAN_ATTRS_STRINGS(V)                                           \
  NSOLID_SPAN_BASE_ATTRS_STRINGS(V)                                            \
  NSOLID_SPAN_DNS_ATTRS_STRINGS(V)                                             \
  NSOLID_SPAN_HTTP_ATTRS_STRINGS(V)

#define NSOLID_SPAN_ATTRS_NUMBERS(V)                                           \
  NSOLID_SPAN_BASE_ATTRS_NUMBERS(V)                                            \
  NSOLID_SPAN_DNS_ATTRS_NUMBERS(V)                                             \
  NSOLID_SPAN_HTTP_ATTRS_NUMBERS(V)


// Predefinitions
class SpanPropBase;

class Span {
 public:
  enum PropType {
#define V(Enum)                                                                \
    Enum,
  NSOLID_SPAN_PROP_TYPES_STRINGS(V)
  NSOLID_SPAN_PROP_TYPES_NUMBERS(V)
#undef V
#define V(Enum, Type, CName, JSName)                                           \
    Enum,
  NSOLID_SPAN_ATTRS(V)
#undef V
  };

  enum DnsOpType {
#define V(Type)                                                                \
    Type,
  NSOLID_SPAN_DNS_TYPES(V)
#undef V
  };

  static const char* traceTypeToString(const Tracer::SpanType& type);

  template <typename T>
  static std::unique_ptr<SpanPropBase> createSpanProp(PropType type, T value);

 private:
  explicit Span(uint64_t thread_id);

  void add_prop(const SpanPropBase& prop);
  void add_attribute(const SpanPropBase& prop);

  Tracer::SpanType type() const;

  friend class TracerImpl;
  Tracer::SpanStor stor_;
};


class SpanPropBase {
 public:
  explicit SpanPropBase(const Span::PropType& t): type_(t) {}

  virtual ~SpanPropBase() {}

  template <typename Type>
  const Type& val() const;

  Span::PropType type() const { return type_; }
 private:
  Span::PropType type_;
};


template <typename Type>
class SpanProp: public SpanPropBase {
 public:
  explicit SpanProp(const Span::PropType& t, const Type& v): SpanPropBase(t),
                                                             value_(v) {}
  const Type& val() const { return value_; }
 private:
  Type value_;
};


struct SpanItem {
  uint32_t span_id = 0;
  uint64_t thread_id = -1;
  std::unique_ptr<SpanPropBase> prop;
};


class NODE_EXTERN TracerImpl {
 public:
  TracerImpl();
  ~TracerImpl() = default;

  struct TraceHookStor {
    uint32_t flags;
    Tracer* tracer;
    Tracer::tracer_proxy_sig cb;
    nsolid::internal::user_data data;
  };

  TSList<TracerImpl::TraceHookStor>::iterator addHook(
      uint32_t flags,
      Tracer* tracer,
      void* data,
      Tracer::tracer_proxy_sig cb,
      internal::deleter_sig deleter);

  void addSpanItem(const SpanItem& item);

  void endPendingSpans();

  void pushSpanData(SpanItem&& item);

  void removeHook(TSList<TraceHookStor>::iterator it);

  uint32_t traceFlags() { return ts_trace_flags_.load(); }

 private:
  static void expired_span_cb_(Span trace, TracerImpl* tracer);
  static void get_trace_item_cb_(std::queue<SpanItem>&& q);

  void update_flags();

  LRUMap<uint32_t, Span> pending_spans_;
  TSList<TraceHookStor> trace_hook_list_;
  std::atomic<uint32_t> ts_trace_flags_ = { 0 };
};


template <typename T>
std::unique_ptr<SpanPropBase> Span::createSpanProp(Span::PropType type,
                                                   T value) {
  return std::make_unique<SpanProp<T>>(type, value);
}



template <typename Type>
const Type& SpanPropBase::val() const {
  return static_cast<const SpanProp<Type>&>(*this).val();
}

}  // namespace tracing
}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_NSOLID_TRACE_H_
