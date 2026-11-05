'use strict';

const {
  ArrayIsArray,
} = primordials;

const {
  codes: {
    ERR_INVALID_ARG_TYPE,
    ERR_NSOLID_OTEL_API_ALREADY_REGISTERED,
  },
} = require('internal/errors');
const internalApi = require('internal/otel/api');
const { kEmptyObject } = require('internal/util');
const { validateBoolean, validateObject } = require('internal/validators');

let api_;
let instrumentations_ = [];
let tracesEnabled_ = true;
let traceApiEnabled_ = false;

function getApi() {
  return api_ || internalApi;
}

function register(api, options = kEmptyObject) {
  if (api_) {
    throw new ERR_NSOLID_OTEL_API_ALREADY_REGISTERED();
  }

  validateObject(options, 'options');
  const { traces = true, metrics = false } = options;
  validateBoolean(traces, 'options.traces');
  validateBoolean(metrics, 'options.metrics');

  // TODO(santigimeno): perform some kind of validation that the api is actually
  // the OTEL api.
  api_ = api;
  tracesEnabled_ = traces;
  const { getTraceFlags, nsolidTracer } = require('internal/nsolid_trace');
  if (traces) {
    nsolidTracer.on('flagsUpdated', (flags) => {
      if (flags) {
        enableApi();
      } else {
        disableApi();
      }
    });
  }

  if (metrics) enableMeterApi();

  if (traces && getTraceFlags()) {
    return enableApi();
  }

  return true;
}

function registerInstrumentations(instrumentations) {
  if (instrumentations && typeof instrumentations === 'object') {
    if (!ArrayIsArray(instrumentations)) {
      instrumentations = [ instrumentations ];
    }
  } else {
    throw new ERR_INVALID_ARG_TYPE('instrumentations',
                                   ['Array', 'object'],
                                   instrumentations);
  }

  if (!tracesEnabled_) return;

  const { getTraceFlags } = require('internal/nsolid_trace');
  if (getTraceFlags()) {
    enableInsts(instrumentations);
  } else {
    disableInsts(instrumentations);
  }

  instrumentations_ = instrumentations_.concat(instrumentations);
}

function disableApi() {
  if (traceApiEnabled_) {
    traceApiEnabled_ = false;
    api_.context.disable();
    api_.trace.disable();
  }
  disableInsts(instrumentations_);
}

function disableInsts(insts) {
  for (let i = 0; i < insts.length; i++) {
    const inst = insts[i];
    if (inst?.disable && typeof inst.disable === 'function') {
      inst.disable();
    }
  }
}

function enableApi() {
  if (traceApiEnabled_) return true;
  const { contextManager } = require('internal/otel/context');
  const { tracerProvider } = require('internal/otel/trace');
  const { context, trace } = api_;

  if (!context.setGlobalContextManager(contextManager)) {
    return false;
  }

  if (!trace.setGlobalTracerProvider(tracerProvider)) {
    context.disable();
    return false;
  }

  traceApiEnabled_ = true;
  enableInsts(instrumentations_);

  return true;
}

function enableMeterApi() {
  const { meterProvider } = require('internal/otel/metrics');
  const { metrics } = api_;

  if (!metrics?.setGlobalMeterProvider || !metrics?.getMeterProvider) {
    return;
  }

  if (metrics.getMeterProvider() === meterProvider) {
    return;
  }

  try {
    metrics.setGlobalMeterProvider(meterProvider);
  } catch {
    // The external API may reject a second global provider registration.
  }

  if (metrics.getMeterProvider() !== meterProvider) {
    process.emitWarning(
      'N|Solid could not install its OpenTelemetry meter provider because ' +
      'another provider is already registered.',
      { code: 'NSOLID_OTEL_METER_PROVIDER_ALREADY_REGISTERED' });
  }
}

function enableInsts(insts) {
  for (let i = 0; i < insts.length; i++) {
    const inst = insts[i];
    if (inst?.enable && typeof inst.enable === 'function') {
      inst.enable();
    }
  }
}

module.exports = {
  getApi,
  register,
  registerInstrumentations,
};
