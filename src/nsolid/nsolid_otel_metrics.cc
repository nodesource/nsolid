#include "nsolid_otel_metrics.h"

#include "env-inl.h"
#include "node_errors.h"
#include "node_external_reference.h"
#include "nsolid/nsolid_api.h"
#include "nsolid_otel_metrics_store.h"
#include "util.h"

#include <cmath>
#include <limits>

namespace node {
namespace metrics {

using v8::Context;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::Value;

Metrics::Metrics(Environment* env, Local<Object> obj):
    BaseObject(env, obj) {
  MakeWeak();
}

void Metrics::MemoryInfo(MemoryTracker* tracker) const {
  USE(tracker);
}

void Metrics::New(const FunctionCallbackInfo<Value>& args) {
  Local<Context> context = args.GetIsolate()->GetCurrentContext();
  Environment* env = Environment::GetCurrent(context);

  new Metrics(env, args.This());
}

void Metrics::Add(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  Metrics* metrics;
  ASSIGN_OR_RETURN_UNWRAP(&metrics, args.This());
  USE(metrics);

  if (args.Length() != 3 || !args[0]->IsUint32() ||
      !args[1]->IsNumber() || !args[2]->IsString()) {
    return THROW_ERR_INVALID_ARG_TYPE(env, "Wrong number of arguments");
  }

  uint32_t instrument_id = args[0]->Uint32Value(env->context()).FromJust();
  double value = args[1]->NumberValue(env->context()).FromJust();
  std::string attributes = *Utf8Value(args.GetIsolate(), args[2]);
  nsolid::EnvInst* envinst =
      nsolid::EnvInst::GetEnvLocalInst(args.GetIsolate());
  CHECK_NOT_NULL(envinst);
  if (envinst->otel_metrics->AddInstrument(instrument_id,
                                           value,
                                           std::move(attributes)) != 0) {
    return THROW_ERR_INVALID_ARG_TYPE(
        env, "Invalid instrument, value, or attributes");
  }
}

void Metrics::RegisterCounter(const FunctionCallbackInfo<Value>& args) {
  RegisterInstrument(args, nsolid::OtelMetricType::kCounter);
}

void Metrics::RegisterGauge(const FunctionCallbackInfo<Value>& args) {
  RegisterInstrument(args, nsolid::OtelMetricType::kGauge);
}

void Metrics::RegisterHistogram(const FunctionCallbackInfo<Value>& args) {
  RegisterInstrument(args, nsolid::OtelMetricType::kHistogram);
}

void Metrics::RegisterUpDownCounter(const FunctionCallbackInfo<Value>& args) {
  RegisterInstrument(args, nsolid::OtelMetricType::kUpDownCounter);
}

void Metrics::RegisterObservableCounter(
    const FunctionCallbackInfo<Value>& args) {
  RegisterInstrument(args, nsolid::OtelMetricType::kObservableCounter);
}

void Metrics::RegisterObservableGauge(
    const FunctionCallbackInfo<Value>& args) {
  RegisterInstrument(args, nsolid::OtelMetricType::kObservableGauge);
}

void Metrics::RegisterObservableUpDownCounter(
    const FunctionCallbackInfo<Value>& args) {
  RegisterInstrument(args, nsolid::OtelMetricType::kObservableUpDownCounter);
}

void Metrics::RegisterObservableCallback(
    const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  if (args.Length() != 1 || !args[0]->IsFunction()) {
    return THROW_ERR_INVALID_ARG_TYPE(env, "Invalid observable callback");
  }
  nsolid::EnvInst* envinst =
      nsolid::EnvInst::GetEnvLocalInst(args.GetIsolate());
  CHECK_NOT_NULL(envinst);
  envinst->RegisterOtelCallback(args[0].As<Function>());
}

void Metrics::RemoveObservableCallback(
    const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  if (args.Length() != 0) {
    return THROW_ERR_INVALID_ARG_TYPE(env, "Invalid arguments");
  }
  nsolid::EnvInst* envinst =
      nsolid::EnvInst::GetEnvLocalInst(args.GetIsolate());
  CHECK_NOT_NULL(envinst);
  envinst->RemoveOtelCallback();
}

void Metrics::Collect(const FunctionCallbackInfo<Value>& args) {
  nsolid::EnvInst* envinst =
      nsolid::EnvInst::GetEnvLocalInst(args.GetIsolate());
  CHECK_NOT_NULL(envinst);
  envinst->CollectOtelMetrics();
}

void Metrics::CollectionDone(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  if (args.Length() != 0) {
    return THROW_ERR_INVALID_ARG_TYPE(env, "Invalid arguments");
  }
  nsolid::EnvInst* envinst =
      nsolid::EnvInst::GetEnvLocalInst(args.GetIsolate());
  if (envinst != nullptr) {
    envinst->CompleteOtelCollection();
  }
}

void Metrics::RegisterInstrument(const FunctionCallbackInfo<Value>& args,
                                 nsolid::OtelMetricType type) {
  Environment* env = Environment::GetCurrent(args);
  Metrics* metrics;
  ASSIGN_OR_RETURN_UNWRAP(&metrics, args.This());
  USE(metrics);
  if ((args.Length() != 6 && args.Length() != 7) || !args[0]->IsString() ||
      !args[1]->IsString() || !args[2]->IsString() ||
      !args[3]->IsString() || !args[4]->IsString() ||
      !args[5]->IsString() || (args.Length() == 7 && !args[6]->IsString())) {
    return THROW_ERR_INVALID_ARG_TYPE(
        env,
        "Meter name, version, schema URL, instrument name, unit, and "
        "description must be strings");
  }

  std::string meter_name = *Utf8Value(args.GetIsolate(), args[0]);
  std::string meter_version = *Utf8Value(args.GetIsolate(), args[1]);
  std::string meter_schema_url = *Utf8Value(args.GetIsolate(), args[2]);
  std::string instrument_name = *Utf8Value(args.GetIsolate(), args[3]);
  std::string unit = *Utf8Value(args.GetIsolate(), args[4]);
  std::string description = *Utf8Value(args.GetIsolate(), args[5]);
  std::optional<std::vector<double>> histogram_boundaries;
  if (args.Length() == 7) {
    if (type != nsolid::OtelMetricType::kHistogram) {
      return THROW_ERR_INVALID_ARG_TYPE(env, "Unexpected histogram boundaries");
    }
    const std::string serialized = *Utf8Value(args.GetIsolate(), args[6]);
    if (!serialized.empty()) {
      nlohmann::json boundaries =
          nlohmann::json::parse(serialized, nullptr, false);
      if (!boundaries.is_array()) {
        return THROW_ERR_INVALID_ARG_TYPE(env, "Invalid histogram boundaries");
      }
      std::vector<double> values;
      double previous = -std::numeric_limits<double>::infinity();
      for (const auto& boundary : boundaries) {
        if (!boundary.is_number() || !std::isfinite(boundary.get<double>()) ||
            boundary.get<double>() <= previous) {
          return THROW_ERR_INVALID_ARG_TYPE(
              env, "Invalid histogram boundaries");
        }
        previous = boundary.get<double>();
        values.push_back(previous);
      }
      histogram_boundaries = std::move(values);
    }
  }
  nsolid::EnvInst* envinst =
      nsolid::EnvInst::GetEnvLocalInst(args.GetIsolate());
  CHECK_NOT_NULL(envinst);
  uint32_t instrument_id;
  if (envinst->otel_metrics->RegisterInstrument(
          std::move(meter_name),
          std::move(meter_version),
          std::move(meter_schema_url),
          std::move(instrument_name),
          std::move(unit),
          std::move(description),
          &instrument_id,
          type,
          std::move(histogram_boundaries)) != 0) {
    return THROW_ERR_INVALID_ARG_TYPE(env, "Too many instruments");
  }
  args.GetReturnValue().Set(instrument_id);
}

void Metrics::Disable(const FunctionCallbackInfo<Value>& args) {
  Metrics* metrics;
  ASSIGN_OR_RETURN_UNWRAP(&metrics, args.This());
  USE(metrics);
  nsolid::EnvInst* envinst =
      nsolid::EnvInst::GetEnvLocalInst(args.GetIsolate());
  CHECK_NOT_NULL(envinst);
  envinst->DisableOtelMetrics();
}

void Metrics::Initialize(Local<Object> target,
                         Local<Value> unused,
                         Local<Context> context,
                         void* priv) {
  Environment* env = Environment::GetCurrent(context);
  Isolate* isolate = env->isolate();

  Local<FunctionTemplate> metrics = NewFunctionTemplate(isolate, Metrics::New);

  metrics->InstanceTemplate()->
    SetInternalFieldCount(Metrics::kInternalFieldCount);

  SetProtoMethod(isolate, metrics, "add", Add);
  SetProtoMethod(isolate, metrics, "record", Add);
  SetProtoMethod(isolate, metrics, "disable", Disable);
  SetProtoMethod(isolate, metrics, "registerCounter", RegisterCounter);
  SetProtoMethod(isolate, metrics, "registerGauge", RegisterGauge);
  SetProtoMethod(isolate, metrics, "registerHistogram", RegisterHistogram);
  SetProtoMethod(isolate, metrics, "registerUpDownCounter",
                 RegisterUpDownCounter);
  SetProtoMethod(isolate, metrics, "registerObservableCounter",
                 RegisterObservableCounter);
  SetProtoMethod(isolate, metrics, "registerObservableGauge",
                 RegisterObservableGauge);
  SetProtoMethod(isolate, metrics, "registerObservableUpDownCounter",
                 RegisterObservableUpDownCounter);
  SetProtoMethod(isolate, metrics, "registerObservableCallback",
                 RegisterObservableCallback);
  SetProtoMethod(isolate, metrics, "removeObservableCallback",
                 RemoveObservableCallback);
  SetProtoMethod(isolate, metrics, "collectionDone", CollectionDone);
  SetProtoMethod(isolate, metrics, "collect", Collect);
  SetConstructorFunction(context, target, "Metrics", metrics);

  target->Set(context,
              FIXED_ONE_BYTE_STRING(env->isolate(), "Metrics"),
              metrics->GetFunction(context).ToLocalChecked()).Check();
}

void Metrics::RegisterExternalReferences(ExternalReferenceRegistry* registry) {
  registry->Register(Metrics::New);
  registry->Register(Metrics::Add);
  registry->Register(Metrics::Disable);
  registry->Register(Metrics::RegisterCounter);
  registry->Register(Metrics::RegisterGauge);
  registry->Register(Metrics::RegisterHistogram);
  registry->Register(Metrics::RegisterUpDownCounter);
  registry->Register(Metrics::RegisterObservableCounter);
  registry->Register(Metrics::RegisterObservableGauge);
  registry->Register(Metrics::RegisterObservableUpDownCounter);
  registry->Register(Metrics::RegisterObservableCallback);
  registry->Register(Metrics::RemoveObservableCallback);
  registry->Register(Metrics::CollectionDone);
  registry->Register(Metrics::Collect);
}

}  // namespace metrics
}  // namespace node

NODE_BINDING_CONTEXT_AWARE_INTERNAL(metrics, node::metrics::Metrics::Initialize)
NODE_BINDING_EXTERNAL_REFERENCE(
    metrics, node::metrics::Metrics::RegisterExternalReferences)
