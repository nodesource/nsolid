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

let api_;
let instrumentations_ = [];

function getApi() {
  return api_ || internalApi;
}

function register(api) {
  if (api_) {
    throw new ERR_NSOLID_OTEL_API_ALREADY_REGISTERED();
  }

  // TODO(santigimeno): perform some kind of validation that the api is actually
  // the OTEL api.
  api_ = api;
  const { getTraceFlags, nsolidTracer } = require('internal/nsolid_trace');
  nsolidTracer.on('flagsUpdated', (flags) => {
    if (flags) {
      enableApi();
    } else {
      disableApi();
    }
  });

  if (getTraceFlags()) {
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

  const { getTraceFlags } = require('internal/nsolid_trace');
  if (getTraceFlags()) {
    enableInsts(instrumentations);
  } else {
    disableInsts(instrumentations);
  }

  instrumentations_ = instrumentations_.concat(instrumentations);
}

function disableApi() {
  api_.context.disable();
  api_.trace.disable();
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
  const { contextManager } = require('internal/otel/context');
  const { tracerProvider } = require('internal/otel/trace');
  const { context, trace } = api_;

  if (!context.setGlobalContextManager(contextManager)) {
    return false;
  }

  if (!trace.setGlobalTracerProvider(tracerProvider)) {
    return false;
  }

  enableInsts(instrumentations_);

  return true;
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
