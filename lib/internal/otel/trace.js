'use strict';

const {
  ArrayBuffer,
  Date,
  DatePrototypeGetTime,
  JSONStringify,
  MathMax,
  MathRandom,
  NumberIsFinite,
  NumberIsInteger,
  NumberParseInt,
  NumberPrototypeToString,
  RegExpPrototypeExec,
  SafeMap,
  StringPrototypePadStart,
  StringPrototypeSlice,
  Uint32Array,
  Uint8Array,
} = primordials;

const { kEmptyObject } = require('internal/util');

const binding = internalBinding('nsolid_api');
const { nsolid_consts } = binding;

const {
  getApi,
  kStartSpan,
} = require('internal/otel/core');
const {
  getTraceFlags,
} = require('internal/nsolid_trace');

const {
  isTimeInput,
} = require('internal/otel/utils');

const { now, getTimeOriginTimestamp } = require('internal/perf/utils');

function isRelativeTime(time) {
  // Match OpenTelemetry JS's distinction between performance.now() and epoch ms.
  return typeof time === 'number' && time < getTimeOriginTimestamp() / 2;
}

// Convert span timestamps to epoch milliseconds.
function toSpanTime(time, offset) {
  let timestamp;
  if (typeof time === 'number') {
    timestamp = isRelativeTime(time) ? time + offset : time;
  } else if (time instanceof Date) {
    timestamp = DatePrototypeGetTime(time);
  } else if (isTimeInput(time) &&
             NumberIsInteger(time[0]) && time[0] >= 0 &&
             NumberIsInteger(time[1]) && time[1] >= 0 && time[1] < 1e9) {
    timestamp = time[0] * 1000 + time[1] / 1e6;
  }
  // Exported timestamps must fit in signed 64-bit nanoseconds.
  if (timestamp >= 0 && timestamp * 1e6 < 2 ** 63) {
    return timestamp;
  }
  return undefined;
}

// Span, trace and parent IDs are handled as uint32 words: [0, 1] span id
// (high, low), [2..5] trace id, [6, 7] parent span id. The hex form is the
// words in order, each as 8 lowercase hex digits, both here and in C++, so it
// doesn't depend on the host byte order. Explicit backing storage avoids
// allocation when fast calls access the views.
const idScratch = new ArrayBuffer(32);
const spanIdView = new Uint8Array(idScratch, 0, 8);
const traceIdView = new Uint8Array(idScratch, 8, 16);
const idWords = new Uint32Array(idScratch);

const kHexBytes = [];
for (let i = 0; i < 256; i++) {
  kHexBytes[i] = StringPrototypePadStart(NumberPrototypeToString(i, 16), 2, '0');
}

function hexWord(word) {
  return kHexBytes[word >>> 24] + kHexBytes[(word >>> 16) & 0xff] +
         kHexBytes[(word >>> 8) & 0xff] + kHexBytes[word & 0xff];
}

function encodeSpanId(high, low) {
  return hexWord(high) + hexWord(low);
}

function encodeTraceId(words) {
  return hexWord(words[0]) + hexWord(words[1]) +
         hexWord(words[2]) + hexWord(words[3]);
}

// Only lowercase hex IDs are turned into words, so encoding them back gives
// the same string. Anything else is passed to C++ as a string, as before.
const kLowerHexTraceId = /^[0-9a-f]{32}$/;
const kLowerHexSpanId = /^[0-9a-f]{16}$/;

function hexToWord(str, start) {
  return NumberParseInt(StringPrototypeSlice(str, start, start + 8), 16);
}

function parseTraceId(traceId) {
  if (typeof traceId !== 'string' ||
      RegExpPrototypeExec(kLowerHexTraceId, traceId) === null) {
    return null;
  }
  return [hexToWord(traceId, 0), hexToWord(traceId, 8),
          hexToWord(traceId, 16), hexToWord(traceId, 24)];
}

function isLowerHexSpanId(spanId) {
  return typeof spanId === 'string' &&
         RegExpPrototypeExec(kLowerHexSpanId, spanId) !== null;
}

class SpanContext {
  spanId;
  traceFlags;
  traceId;
  traceState;

  constructor(spanId, traceFlags, traceId, traceState) {
    this.spanId = spanId;
    this.traceFlags = traceFlags;
    this.traceId = traceId;
    this.traceState = traceState;
  }
}

// `parent` is undefined for a root span, a Span for a local parent, or the
// SpanContext of any other parent span.
function Span(parent, traceFlags, startTimeInput, internal, type, kind, links) {
  // Read the words right away: user code below could start other spans.
  binding.getSpanId(spanIdView);
  this.spanIdHigh = idWords[0];
  this.spanIdLow = idWords[1];
  // Hex SpanContext, built on the first spanContext() call.
  this._spanContext = undefined;
  this._traceFlags = traceFlags;
  // Trace ID words: an array, null if the trace ID isn't lowercase hex, or
  // undefined until a remote trace ID in _traceIdHex is parsed.
  this._traceWords = undefined;
  this._traceIdHex = undefined;
  this._traceState = undefined;
  this.ended = false;
  this._startTime = 0;
  this._monotonicStart = undefined;
  this._performanceOffset = 0;
  this.type = type;
  this.kind = kind;
  this.links = links;
  this.statusCode = 0; // SpanStatusCode.UNSET
  this.statusMsg = '';
  this._sampled = traceFlags & 1; // TraceFlags.SAMPLED;

  let parentIdHigh = 0;
  let parentIdLow = 0;
  let parentSpanIdHex;
  if (parent === undefined) {
    binding.getTraceId(traceIdView);
    this._traceWords = [idWords[2], idWords[3], idWords[4], idWords[5]];
  } else if (parent instanceof Span) {
    // Sampled spans need the words: parse them once, on the parent.
    this._traceWords = this._sampled ?
      parent._getTraceWords() : parent._traceWords;
    this._traceIdHex = parent._traceIdHex;
    this._traceState = parent._traceState;
    parentIdHigh = parent.spanIdHigh;
    parentIdLow = parent.spanIdLow;
  } else {
    // Remote IDs are only parsed if this span is sampled.
    this._traceIdHex = parent.traceId;
    this._traceState = parent.traceState;
    parentSpanIdHex = parent.spanId;
  }

  if (this._isSampled()) {
    this._getTraceWords();
    if (isLowerHexSpanId(parentSpanIdHex)) {
      parentIdHigh = hexToWord(parentSpanIdHex, 0);
      parentIdLow = hexToWord(parentSpanIdHex, 8);
      parentSpanIdHex = undefined;
    }
    // Only reuse finite clock values, even through the private entry point.
    this._monotonicStart = internal && NumberIsFinite(startTimeInput) ? startTimeInput : now();
    this._startTime = binding.getWallTime();
    this._performanceOffset = this._startTime - this._monotonicStart;
    // Normalize the caller's start time to epoch milliseconds.
    if (!internal && startTimeInput != null) {
      const startTimestamp = toSpanTime(startTimeInput, this._performanceOffset);
      if (startTimestamp !== undefined) {
        this._startTime = startTimestamp;
        if (isRelativeTime(startTimeInput)) {
          this._monotonicStart = startTimeInput;
        } else {
          // An explicit epoch start has no known monotonic baseline.
          this._monotonicStart = undefined;
        }
      }
    }
    this._pushSpanStart(parentIdHigh, parentIdLow);
    this._pushSpanDataUint64(nsolid_consts.kSpanType, this.type);
    if (this.kind !== 0) { // SpanKind.INTERNAL
      this._pushSpanDataUint64(nsolid_consts.kSpanKind, this.kind);
    }

    const api = getApi();
    for (const link of links) {
      const context = link?.context;
      if (!context || !api.trace.isSpanContextValid(context) ||
          (context.traceState != null &&
           typeof context.traceState.serialize !== 'function')) continue;
      this._pushSpanDataString(nsolid_consts.kSpanLink, JSONStringify({
        context: {
          traceId: context.traceId,
          spanId: context.spanId,
          traceFlags: context.traceFlags,
          isRemote: context.isRemote,
          traceState: context.traceState?.serialize(),
        },
        attributes: link.attributes,
      }));
    }

    // IDs that couldn't be sent as words.
    if (this._traceWords === null) {
      this._pushSpanDataString(nsolid_consts.kSpanTraceId, this._traceIdHex);
    }
    if (parentSpanIdHex) {
      this._pushSpanDataString(nsolid_consts.kSpanParentSpanId, parentSpanIdHex);
    }
  }
}

Span.prototype._getTraceWords = function() {
  if (this._traceWords === undefined) {
    this._traceWords = parseTraceId(this._traceIdHex);
  }
  return this._traceWords;
};

Span.prototype._pushSpanStart = function(parentIdHigh, parentIdLow) {
  // Fill the scratch right before the call: no user code runs in between.
  idWords[0] = this.spanIdHigh;
  idWords[1] = this.spanIdLow;
  const traceWords = this._traceWords;
  if (traceWords !== null) {
    idWords[2] = traceWords[0];
    idWords[3] = traceWords[1];
    idWords[4] = traceWords[2];
    idWords[5] = traceWords[3];
  } else {
    idWords[2] = idWords[3] = idWords[4] = idWords[5] = 0;
  }
  idWords[6] = parentIdHigh;
  idWords[7] = parentIdLow;
  binding.pushSpanStart(idWords, this._startTime, this._monotonicStart ?? NaN);
};

// Whether a local span can be a parent of a span started by user code.
// Matches api.trace.isSpanContextValid() without building the hex strings.
Span.prototype._hasValidContext = function(api) {
  const words = this._traceWords;
  if (!words) {
    return api.trace.isSpanContextValid(this.spanContext());
  }
  return (words[0] | words[1] | words[2] | words[3]) !== 0 &&
         (this.spanIdHigh | this.spanIdLow) !== 0;
};

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
    time: this._getTime(startTime),
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
                             MathMax(this._startTime, this._getTime(endTime)));
  }

  this.ended = true;
};

Span.prototype._getTime = function(time) {
  if (time != null) {
    const timestamp = toSpanTime(time, this._performanceOffset);
    if (timestamp !== undefined) return timestamp;
  }
  if (this._monotonicStart !== undefined) {
    return this._startTime + (now() - this._monotonicStart);
  }
  return binding.getWallTime();
};

Span.prototype.isRecording = function() {
  return this.ended === false;
};

Span.prototype.recordException = function(exception, e_time) {
  if (this.ended || !this._isSampled()) {
    return this;
  }

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
    this.addEvent('exception', attrs, e_time);
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
  if (this._spanContext === undefined) {
    // Only locally generated trace IDs lack the hex form. Remote ones are
    // kept as given, even if missing.
    if (this._traceIdHex === undefined && this._traceWords) {
      this._traceIdHex = encodeTraceId(this._traceWords);
    }
    this._spanContext = new SpanContext(
      encodeSpanId(this.spanIdHigh, this.spanIdLow),
      this._traceFlags,
      this._traceIdHex,
      this._traceState);
  }
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
    binding.pushSpanDataDouble(this.spanIdHigh, this.spanIdLow, type, name,
                               this._monotonicStart ?? NaN);
  }

  return this;
};

Span.prototype._pushSpanDataString = function(type, name) {
  if (this._isSampled()) {
    binding.pushSpanDataString(this.spanIdHigh, this.spanIdLow, type, name);
  }

  return this;
};

Span.prototype._pushSpanDataString3 = function(type, val1, val2, val3) {
  if (this._isSampled()) {
    binding.pushSpanDataString3(this.spanIdHigh, this.spanIdLow, type, val1, val2, val3);
  }

  return this;
};

Span.prototype._pushSpanDataUint64 = function(type, name) {
  if (this._isSampled()) {
    binding.pushSpanDataUint64(this.spanIdHigh, this.spanIdLow, type, name);
  }

  return this;
};

class Tracer {
  startSpan(name, options = kEmptyObject, context) {
    return this[kStartSpan](name, options, context, false);
  }

  [kStartSpan](name, options = kEmptyObject, context, internal = true) {
    const api = getApi();
    if (!internal && getTraceFlags() === 0) {
      return api.trace.wrapSpanContext(api.INVALID_SPAN_CONTEXT);
    }

    context ||= api.context.active();
    // A local parent span is used directly, so its hex IDs aren't needed.
    let parent;
    if (!options.root) {
      const parentSpan = api.trace.getSpan(context);
      if (parentSpan instanceof Span) {
        if (internal || parentSpan._hasValidContext(api)) {
          parent = parentSpan;
        }
      } else if (parentSpan) {
        const parentContext = parentSpan.spanContext();
        if (parentContext &&
            (internal || api.trace.isSpanContextValid(parentContext))) {
          parent = parentContext;
        }
      }
    }

    // Root spans make the sampling decision, child spans inherit parent flags.
    let flags;
    if (parent === undefined) {
      const sampled = MathRandom() < binding.trace_sample_rate[0];
      flags = sampled ? api.TraceFlags.SAMPLED : api.TraceFlags.NONE;
    } else if (parent instanceof Span) {
      flags = parent._traceFlags;
    } else {
      flags = parent.traceFlags;
    }

    const span = new Span(parent,
                          flags,
                          options.startTime,
                          internal,
                          internal ? (options.type || nsolid_consts.kSpanCustom) : nsolid_consts.kSpanCustom,
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
