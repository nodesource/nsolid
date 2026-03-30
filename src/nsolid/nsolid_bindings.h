#ifndef SRC_NSOLID_NSOLID_BINDINGS_H_
#define SRC_NSOLID_NSOLID_BINDINGS_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include "node_snapshotable.h"
#include "v8-fast-api-calls.h"

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
  static void FastPushClientBucket(v8::Local<v8::Object> receiver,
                                   double val,
                                   uint32_t method,
                                   uint32_t status_code,
                                   const v8::FastOneByteString& server_address,
                                   uint32_t server_port,
                                   uint32_t protocol_version);
  static void PushClientBucketImpl(BindingData* data,
                                   double val,
                                   uint32_t method,
                                   uint32_t status_code,
                                   const std::string& server_address,
                                   uint32_t server_port,
                                   uint32_t protocol_version);

  static void SlowPushDnsBucket(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void FastPushDnsBucket(v8::Local<v8::Object> receiver, double val);
  static void PushDnsBucketImpl(BindingData* data, double val);

  static void SlowPushServerBucket(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void FastPushServerBucket(v8::Local<v8::Object> receiver,
                                   double val,
                                   uint32_t method,
                                   uint32_t status_code,
                                   uint32_t url_scheme,
                                   uint32_t protocol_version,
                                   const v8::FastOneByteString& route);
  static void PushServerBucketImpl(BindingData* data,
                                   double val,
                                   uint32_t method,
                                   uint32_t status_code,
                                   uint32_t url_scheme,
                                   uint32_t protocol_version,
                                   const std::string& route);

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

  static void SlowPushSpanDataString(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void FastPushSpanDataString(v8::Local<v8::Object> receiver,
                                     uint32_t trace_id,
                                     uint32_t type,
                                     const v8::FastOneByteString& val);
  static void PushSpanDataStringImpl(BindingData* data,
                                     uint32_t trace_id,
                                     uint32_t type,
                                     const std::string& val);
  static void SlowPushSpanDataString3(
      const v8::FunctionCallbackInfo<v8::Value>& args);
  static void FastPushSpanDataString3(v8::Local<v8::Object> receiver,
                                      uint32_t trace_id,
                                      uint32_t type,
                                      const v8::FastOneByteString& val1,
                                      const v8::FastOneByteString& val2,
                                      const v8::FastOneByteString& val3);
  static void PushSpanDataStringImpl3(BindingData* data,
                                     uint32_t trace_id,
                                     uint32_t type,
                                     const std::string& val1,
                                     const std::string& val2,
                                     const std::string& val3);

  // Fast API versions for GetSpanId and GetTraceId
  static void SlowGetSpanId(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void SlowGetTraceId(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void FastGetSpanId(v8::Local<v8::Value> receiver,
                            v8::Local<v8::Value> buffer);
  static void FastGetTraceId(v8::Local<v8::Value> receiver,
                             v8::Local<v8::Value> buffer);
  static void SlowWriteLog(const v8::FunctionCallbackInfo<v8::Value>& args);
  static void FastWriteLog(v8::Local<v8::Object> receiver,
                           const v8::FastOneByteString& msg,
                           uint32_t severity);
  static void WriteLogImpl(BindingData* data,
                           const std::string& msg,
                           uint32_t severity);

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
  static v8::CFunction fast_push_span_data_string_;
  static v8::CFunction fast_push_span_data_string3_;
  static v8::CFunction fast_get_span_id_;
  static v8::CFunction fast_get_trace_id_;
  static v8::CFunction fast_write_log_;
};

}  // namespace nsolid
}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NSOLID_NSOLID_BINDINGS_H_
