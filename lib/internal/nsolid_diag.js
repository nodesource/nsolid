'use strict';

const nsolidApi = internalBinding('nsolid_api');
const {
  nsolid_counts,
  nsolid_span_id_s,
  nsolid_tracer_s,
  nsolid_consts,
} = nsolidApi;

const { now } = require('internal/perf/utils');
const { contextManager } = require('internal/otel/context');
const {
  getApi,
} = require('internal/otel/core');

const {
  extractSpanContextFromHttpHeaders,
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
  kSpanHttpProtocolVersion,
  kSpanHttpReqUrl,
  kSpanHttpServer,
  kSpanHttpStatusCode,
} = nsolid_consts;

const undiciFetch = dc.tracingChannel('undici:fetch');
const http2Client = dc.tracingChannel('http2.client');
const http2Server = dc.tracingChannel('http2.server');

// To lazy load the http2 constants
let http2Constants;

let tracingEnabled = false;

function disableTracing() {
  undiciFetch.start.unbindStore();
  http2Client.start.unbindStore();
  http2Server.start.unbindStore();
}

function extractHttp2Url(headers, http2Constants) {
  const { HTTP2_HEADER_SCHEME, HTTP2_HEADER_PATH } = http2Constants;
  const authority = require('internal/http2/util').getAuthority(headers);
  return `${headers[HTTP2_HEADER_SCHEME]}://${authority}${headers[HTTP2_HEADER_PATH]}`;
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

  http2Client.start.bindStore(contextManager._getALS(), (data) => {
    const api = getApi();
    const tracer = api.trace.getTracer('http2');
    http2Constants ||= require('internal/http2/core').constants;
    const { headers } = data;
    const method = headers[http2Constants.HTTP2_HEADER_METHOD];
    const url = extractHttp2Url(headers, http2Constants);
    const span = tracer.startSpan(`HTTP ${method}`,
                                  { internal: true,
                                    kind: api.SpanKind.CLIENT,
                                    type: kSpanHttpClient });
    span._pushSpanDataString(kSpanHttpMethod, method);
    span._pushSpanDataString(kSpanHttpReqUrl, url);
    span._pushSpanDataString(kSpanHttpProtocolVersion, '2');
    const { spanId, traceId } = span.spanContext();
    if (span._isSampled()) {
      headers.traceparent = `00-${traceId}-${spanId}-01`;
    } else {
      headers.traceparent = `00-${traceId}-${spanId}-00`;
    }

    data.headersUpdated = true;
    return api.trace.setSpan(api.context.active(), span);
  });

  http2Server.start.bindStore(contextManager._getALS(), (data) => {
    const api = getApi();
    const tracer = api.trace.getTracer('http2');
    http2Constants ||= require('internal/http2/core').constants;
    const { headers } = data;
    const method = headers[http2Constants.HTTP2_HEADER_METHOD];
    const url = extractHttp2Url(headers, http2Constants);
    const ctxt = extractSpanContextFromHttpHeaders(api.ROOT_CONTEXT, headers);
    const span = tracer.startSpan(`HTTP ${method}`,
                                  { internal: true,
                                    kind: api.SpanKind.SERVER,
                                    type: kSpanHttpServer },
                                  ctxt);
    span._pushSpanDataString(kSpanHttpMethod, method);
    span._pushSpanDataString(kSpanHttpProtocolVersion, '2');
    span._pushSpanDataString(kSpanHttpReqUrl, url);
    return api.trace.setSpan(api.context.active(), span);
  });
}

nsolidTracer.on('flagsUpdated', () => {
  const next = nsolidApi.getConfig()?.tracingEnabled === true &&
    generateSpan(kSpanHttpClient);
  if (next && !tracingEnabled) {
    enableTracing();
    tracingEnabled = true;
  } else if (!next && tracingEnabled) {
    disableTracing();
    tracingEnabled = false;
  }
});

dc.subscribe('undici:client:connected', ({ connectParams }) => {
  const api = getApi();
  const span = api.trace.getSpan(api.context.active());
  if (span && span.type === kSpanHttpClient) {
    const version = connectParams.version === 'h1' ? '1.1' : '2';
    span._pushSpanDataString(kSpanHttpProtocolVersion, version);
    return api.context.active();
  }
});

dc.subscribe('undici:request:create', ({ request }) => {
  request[nsolid_tracer_s] = now();
  const api = getApi();
  const span = api.trace.getSpan(api.context.active());
  if (span) {
    request[nsolid_span_id_s] = span;
  }
});

dc.subscribe('undici:request:headers', ({ request, response }) => {
  nsolid_counts[kHttpClientCount]++;
  nsolidApi.pushClientBucket(now() - request[nsolid_tracer_s]);
  if (generateSpan(kSpanHttpClient)) {
    const span = request[nsolid_span_id_s];
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
    const span = request[nsolid_span_id_s];
    span?.end();
  }
});

dc.subscribe('undici:request:error', ({ request, error }) => {
  nsolid_counts[kHttpClientAbortCount]++;
  if (generateSpan(kSpanHttpClient)) {
    const span = request[nsolid_span_id_s];
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

  if (generateSpan(kSpanHttpClient)) {
    const api = getApi();
    const span = api.trace.getSpan(api.context.active());
    if (span) {
      stream[nsolid_span_id_s] = span;
    }
  }
});

dc.subscribe('http2.client.stream.finish', ({ stream, headers }) => {
  stream[nsolid_tracer_s].response = true;
  http2Constants ||= require('internal/http2/core').constants;
  if (generateSpan(kSpanHttpClient)) {
    const span = stream[nsolid_span_id_s];
    if (span) {
      const status = headers[http2Constants.HTTP2_HEADER_STATUS];
      span._pushSpanDataUint64(kSpanHttpStatusCode, status);
      if (status >= 400) {
        span.setStatus({ code: getApi().SpanStatusCode.ERROR });
      }
    }
  }
});

dc.subscribe('http2.client.stream.error', ({ stream, error }) => {
  if (generateSpan(kSpanHttpClient)) {
    const span = stream[nsolid_span_id_s];
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

dc.subscribe('http2.client.stream.close', ({ stream, code }) => {
  http2Constants ||= require('internal/http2/core').constants;
  const tracingInfo = stream[nsolid_tracer_s];
  const span = stream[nsolid_span_id_s];
  if (code === http2Constants.NGHTTP2_NO_ERROR && tracingInfo.response) {
    nsolid_counts[kHttpClientCount]++;
    nsolidApi.pushClientBucket(now() - tracingInfo.start);
  } else {
    nsolid_counts[kHttpClientAbortCount]++;
    if (span) {
      span.setStatus({
        code: getApi().SpanStatusCode.ERROR,
      });
    }
  }

  span?.end();
});

dc.subscribe('http2.server.stream.start', ({ stream, headers }) => {
  stream[nsolid_tracer_s] = {
    start: now(),
    response: false,
  };

  if (generateSpan(kSpanHttpServer)) {
    const api = getApi();
    const span = api.trace.getSpan(api.context.active());
    if (span) {
      stream[nsolid_span_id_s] = span;
    }
  }
});

dc.subscribe('http2.server.stream.finish', ({ stream, headers }) => {
  stream[nsolid_tracer_s].response = true;
});

dc.subscribe('http2.server.stream.error', ({ stream, error }) => {
  if (generateSpan(kSpanHttpServer)) {
    const span = stream[nsolid_span_id_s];
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

dc.subscribe('http2.server.stream.close', ({ stream, code }) => {
  http2Constants ||= require('internal/http2/core').constants;
  const tracingInfo = stream[nsolid_tracer_s];
  const span = stream[nsolid_span_id_s];
  if (code === http2Constants.NGHTTP2_NO_ERROR && tracingInfo.response) {
    nsolid_counts[kHttpServerCount]++;
    nsolidApi.pushServerBucket(now() - tracingInfo.start);
  } else {
    nsolid_counts[kHttpServerAbortCount]++;
    if (span) {
      span.setStatus({
        code: getApi().SpanStatusCode.ERROR,
      });
    }
  }

  if (span) {
    if (stream.headersSent) {
      const status = stream.sentHeaders[http2Constants.HTTP2_HEADER_STATUS];
      span._pushSpanDataUint64(kSpanHttpStatusCode, status);
    }

    span.end();
  }
});
