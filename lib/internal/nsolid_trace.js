'use strict';

const {
  ArrayIsArray,
  NumberParseInt,
  RegExp,
} = primordials;

const { nsolidApi } = require('internal/async_hooks');

const {
  getApi,
} = require('internal/otel/core');

const VERSION_PART = '(?!ff)[\\da-f]{2}';
const TRACE_ID_PART = '(?![0]{32})[\\da-f]{32}';
const PARENT_ID_PART = '(?![0]{16})[\\da-f]{16}';
const FLAGS_PART = '[\\da-f]{2}';
const TRACE_PARENT_REGEX = new RegExp(`^\\s?(${VERSION_PART})-(${TRACE_ID_PART})-(${PARENT_ID_PART})-(${FLAGS_PART})(-.*)?\\s?$`);


function generateSpan(type) {
  return nsolidApi.traceFlags[0] & type;
}

function parseTraceParent(traceParent) {
  const match = TRACE_PARENT_REGEX.exec(traceParent);
  if (!match)
    return null;
  // According to the specification the implementation should be compatible
  // with future versions. If there are more parts, we only reject it if it's
  // using version 00
  // See https://www.w3.org/TR/trace-context/#versioning-of-traceparent
  if (match[1] === '00' && match[5])
    return null;
  return {
    traceId: match[2],
    spanId: match[3],
    traceFlags: NumberParseInt(match[4], 16),
  };
}

function extractSpanContextFromHttpHeaders(context, headers) {
  const traceParentHeader = headers.traceparent;
  if (!traceParentHeader) {
    return context;
  }
  const traceParent = ArrayIsArray(traceParentHeader) ?
    traceParentHeader[0] : traceParentHeader;
  if (typeof traceParent !== 'string')
    return context;
  const spanContext = parseTraceParent(traceParent);
  if (!spanContext)
    return context;
  // Const traceStateHeader = headers.tracestate;
  // if (traceStateHeader) {
  //   // If more than one `tracestate` header is found, we merge them into a
  //   // single header.
  //   const state = Array.isArray(traceStateHeader)
  //       ? traceStateHeader.join(',')
  //       : traceStateHeader;
  //   spanContext.traceState =
  //     new TraceState(typeof state === 'string' ? state : undefined);
  // }

  return getApi().trace.setSpanContext(context, spanContext);
}

module.exports = {
  extractSpanContextFromHttpHeaders,
  generateSpan,
};
