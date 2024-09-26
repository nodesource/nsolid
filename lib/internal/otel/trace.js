'use strict';

const {
  JSONStringify,
  SafeMap,
} = primordials;

const binding = internalBinding('nsolid_api');
const { getSpanId,
        getTraceId,
        pushSpanDataString,
        nsolid_consts } = binding;

const {
  getApi,
} = require('internal/otel/core');

const {
  newInternalSpanId,
  isTimeInput,
} = require('internal/otel/utils');

const { now, getTimeOriginTimestamp } = require('internal/perf/utils');

class SpanContext {
  internalId;
  spanId;
  traceFlags;
  traceId;
  traceState;

  constructor(internalId, spanId, traceFlags, traceId, traceState) {
    this.internalId = internalId;
    this.spanId = spanId;
    this.traceFlags = traceFlags;
    this.traceId = traceId;
    this.traceState = traceState;
  }
}

function Span(internalId, ids_str, spanContext, startTime, type, kind, links) {
  this._spanContext = spanContext;
  this.ended = false;
  this.internalId = internalId;
  this.type = type;
  this.kind = kind;
  this.links = links;
  this.statusCode = 0; // SpanStatusCode.UNSET
  this.statusMsg = '';
  this._sampled = spanContext.traceFlags & 1; // TraceFlags.SAMPLED;

  if (this._isSampled()) {
    this._pushSpanDataDouble(nsolid_consts.kSpanStart, startTime);
    this._pushSpanDataUint64(nsolid_consts.kSpanType, this.type);
    if (this.kind !== 0) { // SpanKind.INTERNAL
      this._pushSpanDataUint64(nsolid_consts.kSpanKind, this.kind);
    }

    this._pushSpanDataString(nsolid_consts.kSpanOtelIds, ids_str);
  }
}

Span.prototype.addEvent = function(name, attributes, startTime) {
  if (this.ended || !this._isSampled()) {
    return this;
  }

  if (isTimeInput(attributes)) {
    startTime = attributes;
    attributes = undefined;
  }

  const event = {
    name,
    attributes,
    time: startTime != null ? startTime : getTimeOriginTimestamp() + now(),
  };

  this._pushSpanDataString(nsolid_consts.kSpanEvent,
                           JSONStringify(event));
  return this;
};

Span.prototype.end = function(endTime) {
  if (this._isSampled()) {
    // Send here also the SpanStatus if it was changed from the defaults
    if (this.statusCode !== 0) {
      this._pushSpanDataUint64(nsolid_consts.kSpanStatusCode,
                               this.statusCode);
    }

    if (this.statusMsg !== '') {
      this._pushSpanDataString(nsolid_consts.kSpanStatusMsg,
                               this.statusMsg);
    }

    this._pushSpanDataDouble(nsolid_consts.kSpanEnd,
                             isTimeInput(endTime) ? endTime : now());
  }

  this.ended = true;
};

Span.prototype.isRecording = function() {
  return this.ended === false;
};

Span.prototype.recordException = function(exception, e_time) {
  if (this.ended || !this._isSampled()) {
    return this;
  }

  const time = e_time != null ? e_time : getTimeOriginTimestamp() + now();
  const attrs = {};
  if (typeof exception === 'string') {
    attrs['exception.message'] = exception;
  } else if (exception) {
    if (exception.code) {
      attrs['exception.type'] = exception.code.toString();
    } else if (exception.name) {
      attrs['exception.type'] = exception.name;
    }

    if (exception.message) {
      attrs['exception.message'] = exception.message;
    }

    if (exception.stack) {
      attrs['exception.stacktrace'] = exception.stack;
    }
  }
  // These are minimum requirements from spec.
  if (attrs['exception.type'] || attrs['exception.message']) {
    this.addEvent('exception', attrs, time);
  }
};

Span.prototype.setAttribute = function(key, val) {
  if (val == null || this.ended || !this._isSampled()) {
    return this;
  }

  this._pushSpanDataString(nsolid_consts.kSpanCustomAttrs,
                           JSONStringify({ [key]: val }));
  return this;
};

Span.prototype.setAttributes = function(attributes) {
  if (this.ended || !this._isSampled()) {
    return this;
  }

  this._pushSpanDataString(nsolid_consts.kSpanCustomAttrs,
                           JSONStringify(attributes));
  return this;
};

Span.prototype.setStatus = function(status) {
  if (this.ended) {
    return this;
  }

  const api = getApi();
  // When span status is set to Ok it SHOULD be considered final and any further
  // attempts to change it SHOULD be ignored.
  if (this.statusCode === api.SpanStatusCode.OK) {
    return this;
  }

  switch (status.code) {
    case api.SpanStatusCode.OK:
      this.statusCode = status.code;
      break;
    case api.SpanStatusCode.ERROR:
      this.statusCode = status.code;
      if (typeof status.message === 'string') {
        this.statusMsg = status.message;
      }
      break;
    default:
  }

  return this;
};

Span.prototype.spanContext = function() {
  return this._spanContext;
};

Span.prototype.updateName = function(name) {
  if (this.ended || !this._isSampled()) {
    return this;
  }

  this._pushSpanDataString(nsolid_consts.kSpanName, name);
  return this;
};

Span.prototype._isSampled = function() {
  return this._sampled;
};

Span.prototype._pushSpanDataDouble = function(type, name) {
  if (this._isSampled()) {
    binding.pushSpanDataDouble(this.internalId, type, name);
  }

  return this;
};

Span.prototype._pushSpanDataString = function(type, name) {
  if (this._isSampled()) {
    pushSpanDataString(this.internalId, type, name);
  }

  return this;
};

Span.prototype._pushSpanDataUint64 = function(type, name) {
  if (this._isSampled()) {
    binding.pushSpanDataUint64(this.internalId, type, name);
  }

  return this;
};

class Tracer {
  startSpan(name, options = {}, context) {
    const api = getApi();
    if (binding.trace_flags[0] === 0) {
      return api.trace.wrapSpanContext(api.INVALID_SPAN_CONTEXT);
    }

    context = context || api.context.active();
    let parentContext =
      options.root ? undefined : api.trace.getSpanContext(context);
    if (!options.internal) {
      if (parentContext && !api.trace.isSpanContextValid(parentContext)) {
        parentContext = null;
      }
    }

    let ids_str;
    let traceState;
    let traceId;

    const spanId = getSpanId();
    if (!parentContext) {
      // New root span.
      traceId = getTraceId();
      ids_str = `${traceId}:${spanId}`;
    } else {
      // New child span.
      traceId = parentContext.traceId;
      traceState = parentContext.traceState;
      ids_str = `${traceId}:${spanId}:${parentContext.spanId}`;
    }

    const internalId = newInternalSpanId();
    // Follow parent, root always sampled.
    let flags = api.TraceFlags.SAMPLED;
    if (parentContext)
      flags = parentContext.traceFlags;
    const spanContext = new SpanContext(internalId,
                                        spanId,
                                        flags,
                                        traceId,
                                        traceState);

    const startTime = options.startTime || now();
    const span = new Span(internalId,
                          ids_str,
                          spanContext,
                          startTime,
                          options.type || nsolid_consts.kSpanCustom,
                          options.kind || api.SpanKind.INTERNAL,
                          options.links || []);
    span.updateName(name);
    if (options.attributes) {
      span.setAttributes(options.attributes);
    }

    return span;
  }

  startActiveSpan(name, options, context, fn) {
    if (typeof options === 'function') {
      fn = options;
      options = {};
      context = undefined;
    } else if (typeof context === 'function') {
      fn = context;
      context = undefined;
    }

    const api = getApi();
    const span = this.startSpan(name, options, context);
    const activeContext = api.trace.setSpan(api.context.active(), span);
    api.context.with(activeContext, fn);
  }
}

class TracerProvider {
  #tracers;
  constructor() {
    this.#tracers = new SafeMap();
  }

  getTracer(name, version = '') {
    const key = `${name}@${version}`;
    if (!this.#tracers.has(key)) {
      this.#tracers.set(key, new Tracer());
    }

    return this.#tracers.get(key);
  }
}

const tracerProvider = new TracerProvider();

module.exports = {
  tracerProvider,
};
