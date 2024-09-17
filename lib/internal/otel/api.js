'use strict';

const { SafeMap,
        SymbolFor } = primordials;

const ROOT_CONTEXT = new BaseContext();

const SpanKind = {
  INTERNAL: 0,
  SERVER: 1,
  CLIENT: 2,
  PRODUCER: 3,
  CONSUMER: 4,
};

const SpanStatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
};

const TraceFlags = {
  NONE: 0,
  SAMPLED: 1,
};

const SPAN_KEY = SymbolFor('OpenTelemetry Context Key SPAN');

const VALID_TRACEID_REGEX = /^([0-9a-f]{32})$/i;
const VALID_SPANID_REGEX = /^[0-9a-f]{16}$/i;

const INVALID_SPANID = '0000000000000000';
const INVALID_TRACEID = '00000000000000000000000000000000';
const INVALID_SPAN_CONTEXT = {
  traceId: INVALID_TRACEID,
  spanId: INVALID_SPANID,
  traceFlags: TraceFlags.NONE,
};

function BaseContext(parentContext) {
  this._currentContext =
    parentContext ? new SafeMap(parentContext) : new SafeMap();
  this.getValue = (key) => this._currentContext.get(key);
  this.setValue = (key, value) => {
    const context = new BaseContext(this._currentContext);
    context._currentContext.set(key, value);
    return context;
  };
  this.deleteValue = (key) => {
    const context = new BaseContext(this._currentContext);
    context._currentContext.delete(key);
    return context;
  };
}

function NonRecordingSpan(spanContext) {
  spanContext = spanContext || INVALID_SPAN_CONTEXT;
  this._spanContext = spanContext;
}
// Returns a SpanContext.
NonRecordingSpan.prototype.spanContext = function() {
  return this._spanContext;
};
// By default does nothing
NonRecordingSpan.prototype.setAttribute = function(_key, _value) {
  return this;
};
// By default does nothing
NonRecordingSpan.prototype.setAttributes = function(_attributes) {
  return this;
};
// By default does nothing
NonRecordingSpan.prototype.addEvent = function(_name, _attributes) {
  return this;
};
// By default does nothing
NonRecordingSpan.prototype.setStatus = function(_status) {
  return this;
};
// By default does nothing
NonRecordingSpan.prototype.updateName = function(_name) {
  return this;
};
// By default does nothing
NonRecordingSpan.prototype.end = function(_endTime) { };
// isRecording always returns false for NonRecordingSpan.
NonRecordingSpan.prototype.isRecording = function() {
  return false;
};
// By default does nothing
NonRecordingSpan.prototype.recordException = function(_exception, _time) {};

const context = {
  active() {
    const { contextManager } = require('internal/otel/context');
    return contextManager.active();
  },
  bind(context, target) {
    const { contextManager } = require('internal/otel/context');
    return contextManager.bind(context, target);
  },
  disable() {
    const { contextManager } = require('internal/otel/context');
    return contextManager.disable();
  },
  with(context, fn, thisArg, ...args) {
    const { contextManager } = require('internal/otel/context');
    return contextManager.with(context, fn, thisArg, ...args);
  },
};

function isValidTraceId(traceId) {
  return VALID_TRACEID_REGEX.test(traceId) && traceId !== INVALID_TRACEID;
}

function isValidSpanId(spanId) {
  return VALID_SPANID_REGEX.test(spanId) && spanId !== INVALID_SPANID;
}

const trace = {
  deleteSpan(context) {
    return context.deleteValue(SPAN_KEY);
  },
  getSpan(context) {
    return context.getValue(SPAN_KEY) || undefined;
  },
  getSpanContext(context) {
    const span = context.getValue(SPAN_KEY);
    return span ? span.spanContext() : null;
  },
  getTracer(name, version) {
    const { tracerProvider } = require('internal/otel/trace');
    return tracerProvider.getTracer(name, version);
  },
  isSpanContextValid(spanContext) {
    return (isValidTraceId(spanContext.traceId) &&
            isValidSpanId(spanContext.spanId));
  },
  setSpan(context, span) {
    return context.setValue(SPAN_KEY, span);
  },
  setSpanContext(context, spanContext) {
    return this.setSpan(context, new NonRecordingSpan(spanContext));
  },
  wrapSpanContext(spanContext) {
    return new NonRecordingSpan(spanContext);
  },
};

module.exports = {
  context,
  trace,
  INVALID_SPAN_CONTEXT,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  TraceFlags,
};
