'use strict';

const nsolidApi = internalBinding('nsolid_api');
const {
  nsolid_counts,
  nsolid_tracer_s,
  nsolid_consts,
} = nsolidApi;

const { now } = require('internal/perf/utils');
const { contextManager } = require('internal/otel/context');
const {
  getApi,
} = require('internal/otel/core');

const {
  generateSpan,
  nsolidTracer,
} = require('internal/nsolid_trace');

const dc = require('diagnostics_channel');

const {
  kHttpClientAbortCount,
  kHttpClientCount,
  kHttpServerAbortCount,
  kHttpServerCount,
  kSpanHttpClient,
  kSpanHttpMethod,
  kSpanHttpReqUrl,
  kSpanHttpStatusCode,
} = nsolid_consts;

const undiciFetch = dc.tracingChannel('undici:fetch');

// To lazy load the http2 constants
let http2Constants;

let tracingEnabled = false;

const fetchSubscribeListener = (message, name) => {};

function disableTracing() {
  undiciFetch.start.unbindStore();
  dc.unsubscribe('tracing:undici:fetch:start', fetchSubscribeListener);
}

function enableTracing() {
  undiciFetch.start.bindStore(contextManager._getALS(), (data) => {
    const { req } = data;
    const api = getApi();
    const tracer = api.trace.getTracer('http');
    const span = tracer.startSpan(`HTTP ${req.method}`,
                                  { internal: true,
                                    kind: api.SpanKind.CLIENT,
                                    type: kSpanHttpClient });
    span._pushSpanDataString(kSpanHttpMethod, req.method);
    span._pushSpanDataString(kSpanHttpReqUrl, req.url);
    const { spanId, traceId } = span.spanContext();
    if (span._isSampled()) {
      req.headers.append('traceparent', `00-${traceId}-${spanId}-01`);
    } else {
      req.headers.append('traceparent', `00-${traceId}-${spanId}-00`);
    }

    return api.trace.setSpan(api.context.active(), span);
  });

  dc.subscribe('tracing:undici:fetch:start', fetchSubscribeListener);
}

nsolidTracer.on('flagsUpdated', () => {
  const next = generateSpan(kSpanHttpClient);
  if (next && !tracingEnabled) {
    enableTracing();
    tracingEnabled = true;
  } else if (!next && tracingEnabled) {
    disableTracing();
    tracingEnabled = false;
  }
});

dc.subscribe('undici:request:create', ({ request }) => {
  request[nsolid_tracer_s] = now();
});

dc.subscribe('undici:request:headers', ({ request, response }) => {
  nsolid_counts[kHttpClientCount]++;
  nsolidApi.pushClientBucket(now() - request[nsolid_tracer_s]);
  if (generateSpan(kSpanHttpClient)) {
    const api = getApi();
    const span = api.trace.getSpan(api.context.active());
    if (span) {
      span._pushSpanDataUint64(kSpanHttpStatusCode, response.statusCode);
      if (response.statusCode >= 400) {
        span.setStatus({ code: getApi().SpanStatusCode.ERROR });
      }
    }
  }
});

dc.subscribe('undici:request:trailers', ({ request }) => {
  if (generateSpan(kSpanHttpClient)) {
    const api = getApi();
    const span = api.trace.getSpan(api.context.active());
    if (span) {
      span.end();
    }
  }
});

dc.subscribe('undici:request:error', ({ request, error }) => {
  nsolid_counts[kHttpClientAbortCount]++;
  if (generateSpan(kSpanHttpClient)) {
    const api = getApi();
    const span = api.trace.getSpan(api.context.active());
    if (span) {
      span.recordException(error);
      span.setStatus({
        code: getApi().SpanStatusCode.ERROR,
        message: error.message,
      });
      span.end();
    }
  }
});

dc.subscribe('http2.client.stream.created', ({ stream }) => {
  stream[nsolid_tracer_s] = {
    start: now(),
    response: false,
  };
});

dc.subscribe('http2.client.stream.finish', ({ stream, flags }) => {
  stream[nsolid_tracer_s].response = true;
});

dc.subscribe('http2.client.stream.close', ({ stream, code }) => {
  http2Constants ||= require('internal/http2/core').constants;
  const tracingInfo = stream[nsolid_tracer_s];
  if (code === http2Constants.NGHTTP2_NO_ERROR && tracingInfo.response) {
    nsolid_counts[kHttpClientCount]++;
    nsolidApi.pushClientBucket(now() - tracingInfo.start);
  } else {
    nsolid_counts[kHttpClientAbortCount]++;
  }
});

dc.subscribe('http2.server.stream.start', ({ stream }) => {
  stream[nsolid_tracer_s] = {
    start: now(),
    response: false,
  };
});

dc.subscribe('http2.server.stream.finish', ({ stream, flags }) => {
  stream[nsolid_tracer_s].response = true;
});

dc.subscribe('http2.server.stream.close', ({ stream, code }) => {
  http2Constants ||= require('internal/http2/core').constants;
  const tracingInfo = stream[nsolid_tracer_s];
  if (code === http2Constants.NGHTTP2_NO_ERROR && tracingInfo.response) {
    nsolid_counts[kHttpServerCount]++;
    nsolidApi.pushServerBucket(now() - tracingInfo.start);
  } else {
    nsolid_counts[kHttpServerAbortCount]++;
  }
});
