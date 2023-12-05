#ifndef SRC_NSOLID_NSOLID_BINDINGS_H_
#define SRC_NSOLID_NSOLID_BINDINGS_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include "node_snapshotable.h"

namespace node {
namespace nsolid {

class BindingData : public SnapshotableObject {
 public:
  BindingData(Realm* realm, v8::Local<v8::Object> object);

  using InternalFieldInfo = InternalFieldInfoBase;

  SERIALIZABLE_OBJECT_METHODS()
  SET_BINDING_ID(nsolid_binding_data)

  SET_NO_MEMORY_INFO()
  SET_SELF_SIZE(BindingData)
  SET_MEMORY_INFO_NAME(BindingData)

  static void SlowPushClientBucket(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void FastPushClientBucket(v8::Local<v8::Object> receiver, double val);
  static void PushClientBucketImpl(BindingData* data, double val);

  static void SlowPushDnsBucket(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void FastPushDnsBucket(v8::Local<v8::Object> receiver, double val);
  static void PushDnsBucketImpl(BindingData* data, double val);

  static void SlowPushServerBucket(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void FastPushServerBucket(v8::Local<v8::Object> receiver, double val);
  static void PushServerBucketImpl(BindingData* data, double val);

  static void SlowPushSpanDataDouble(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void FastPushSpanDataDouble(v8::Local<v8::Object> receiver,
                                     uint32_t trace_id,
                                     uint32_t type,
                                     double val);
  static void PushSpanDataDoubleImpl(BindingData* data,
                                     uint32_t trace_id,
                                     uint32_t type,
                                     double val);

  static void SlowPushSpanDataUint64(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void FastPushSpanDataUint64(v8::Local<v8::Object> receiver,
                                     uint32_t trace_id,
                                     uint32_t type,
                                     uint64_t val);
  static void PushSpanDataUint64Impl(BindingData* data,
                                     uint32_t trace_id,
                                     uint32_t type,
                                     uint64_t val);

  static void Initialize(v8::Local<v8::Object> target,
                         v8::Local<v8::Value> unused,
                         v8::Local<v8::Context> context,
                         void* priv);
  static void RegisterExternalReferences(
      ExternalReferenceRegistry* registry);

 private:
  static v8::CFunction fast_push_client_bucket_;
  static v8::CFunction fast_push_dns_bucket_;
  static v8::CFunction fast_push_server_bucket_;
  static v8::CFunction fast_push_span_data_double_;
  static v8::CFunction fast_push_span_data_uint64_;
};

}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_NSOLID_BINDINGS_H_
