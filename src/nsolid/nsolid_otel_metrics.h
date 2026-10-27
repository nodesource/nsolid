#ifndef SRC_NSOLID_NSOLID_OTEL_METRICS_H_
#define SRC_NSOLID_NSOLID_OTEL_METRICS_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include "base_object.h"
#include "v8.h"

namespace node {

class ExternalReferenceRegistry;

namespace nsolid {
enum class OtelMetricType;
}

namespace metrics {

class Metrics: public BaseObject {
 public:
  static void RegisterExternalReferences(ExternalReferenceRegistry* registry);
  static void New(const v8::FunctionCallbackInfo<v8::Value>& args);

  static void Initialize(v8::Local<v8::Object> target,
                         v8::Local<v8::Value> unused,
                         v8::Local<v8::Context> context,
                         void* priv);

  static void Add(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void Disable(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void RegisterCounter(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void RegisterGauge(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void RegisterHistogram(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void RegisterUpDownCounter(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void RegisterObservableCounter(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void RegisterObservableGauge(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void RegisterObservableUpDownCounter(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void RegisterObservableCallback(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void RemoveObservableCallback(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void CollectionDone(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void RegisterInstrument(
      const v8::FunctionCallbackInfo<v8::Value>& args,
      nsolid::OtelMetricType type);

  Metrics(Environment* env, v8::Local<v8::Object> obj);

  void MemoryInfo(MemoryTracker* tracker) const override;
  SET_MEMORY_INFO_NAME(Metrics)
  SET_SELF_SIZE(Metrics)
};

}  // namespace metrics
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_NSOLID_OTEL_METRICS_H_
