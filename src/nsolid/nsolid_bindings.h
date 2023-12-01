#ifndef SRC_NSOLID_NSOLID_BINDINGS_H_
#define SRC_NSOLID_NSOLID_BINDINGS_H_


#include "node_snapshotable.h"

namespace node {
namespace nsolid {

class BindingData : public SnapshotableObject {
 public:
  SERIALIZABLE_OBJECT_METHODS()
  static constexpr FastStringKey type_name{"node::nsolid::BindingData"};
  static constexpr EmbedderObjectType type_int =
      EmbedderObjectType::k_nsolid_binding_data;

  BindingData(Realm* realm, v8::Local<v8::Object> object);

  using InternalFieldInfo = InternalFieldInfoBase;

  SET_NO_MEMORY_INFO()
  SET_MEMORY_INFO_NAME(BindingData)
  SET_SELF_SIZE(BindingData)

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
  static v8::CFunction fast_push_server_bucket_;
  static v8::CFunction fast_push_span_data_double_;
  static v8::CFunction fast_push_span_data_uint64_;
};



}  // namespace nsolid
}  // namespace node

#endif  // SRC_NSOLID_NSOLID_BINDINGS_H_
