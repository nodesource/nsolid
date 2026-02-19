'use strict';

const {
  Number,
  SafeWeakMap,
} = primordials;

const nsolidApi = internalBinding('nsolid_api');
const {
  nsolid_counts,
  nsolid_net_prot_s,
  nsolid_span_id_s,
  nsolid_tracer_s,
  nsolid_consts,
  nsolid_route_s,
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

const { URL } = require('internal/url');

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

const {
  kHttpMethodMap,
  kHttpMethodOther,
  kHttpVersion11,
  kHttpVersion2,
  kHttpSchemeHttp,
  kHttpSchemeHttps,
} = require('internal/nsolid_http_consts');

const undiciFetch = dc.tracingChannel('undici:fetch');
const http2Client = dc.tracingChannel('http2.client');
const http2Server = dc.tracingChannel('http2.server');

// WeakMap to store HTTP version per socket (undici client connections)
const socketVersionMap = new SafeWeakMap();

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
  const next = generateSpan(kSpanHttpClient);
  if (next && !tracingEnabled) {
    enableTracing();
    tracingEnabled = true;
  } else if (!next && tracingEnabled) {
    disableTracing();
    tracingEnabled = false;
  }
});

dc.subscribe('undici:client:connected', ({ connectParams, socket }) => {
  const api = getApi();
  const span = api.trace.getSpan(api.context.active());
  const version = connectParams.version === 'h1' ? '1.1' : '2';
  const versionConst =
    connectParams.version === 'h1' ? kHttpVersion11 : kHttpVersion2;
  // Store the canonical enum value on the socket for later retrieval in
  // sendHeaders and histogram attribution.
  socketVersionMap.set(socket, versionConst);
  if (span && span.type === kSpanHttpClient) {
    span._pushSpanDataString(kSpanHttpProtocolVersion, version);
    return api.context.active();
  }
});

dc.subscribe('undici:client:sendHeaders', ({ request, socket }) => {
  const versionConst = socketVersionMap.get(socket);
  request[nsolid_net_prot_s] = versionConst;
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
  let host = '';
  let port = 0;
  if (request.origin) {
    try {
      const url = new URL(request.origin);
      host = url.hostname;
      port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
    } catch {
      // Ignore malformed origin
    }
  }
  nsolidApi.pushClientBucket(
    now() - request[nsolid_tracer_s],
    kHttpMethodMap[request.method] ?? kHttpMethodOther,
    response.statusCode,
    host,
    port,
    request[nsolid_net_prot_s]);
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
  http2Constants ||= require('internal/http2/core').constants;
  stream[nsolid_tracer_s] = {
    start: now(),
    response: false,
    method: stream.sentHeaders?.[http2Constants.HTTP2_HEADER_METHOD] || '',
    status: 0,
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
  stream[nsolid_tracer_s].status =
    Number(headers[http2Constants.HTTP2_HEADER_STATUS]) || 0;
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
    const session = stream.session;
    nsolidApi.pushClientBucket(
      now() - tracingInfo.start,
      kHttpMethodMap[tracingInfo.method] ?? kHttpMethodOther,
      tracingInfo.status,
      session?.socket?.remoteAddress || '',
      session?.socket?.remotePort || 0,
      kHttpVersion2);
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
  http2Constants ||= require('internal/http2/core').constants;
  stream[nsolid_tracer_s] = {
    start: now(),
    response: false,
    method: headers[http2Constants.HTTP2_HEADER_METHOD] || '',
    status: 0,
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
  http2Constants ||= require('internal/http2/core').constants;
  stream[nsolid_tracer_s].status =
    Number(stream.sentHeaders?.[http2Constants.HTTP2_HEADER_STATUS]) || 0;
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
    const encrypted = stream.session?.socket?.encrypted;
    const route = stream[nsolid_route_s] || '';
    nsolidApi.pushServerBucket(
      now() - tracingInfo.start,
      kHttpMethodMap[tracingInfo.method] ?? kHttpMethodOther,
      tracingInfo.status,
      encrypted ? kHttpSchemeHttps : kHttpSchemeHttp,
      kHttpVersion2,
      route);
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

dc.subscribe('tracing:fastify.request.handler:start', ({ request, route }) => {
  if (route?.url && request?.raw) {
    // Store the route template using unified nsolid_route_s symbol
    request.raw[nsolid_route_s] = route.url;
  }
});

// Subscribe to HTTP response finish to capture Express routes
// Express sets req.route.path during request processing, available by response time
dc.subscribe('http.server.response.finish', ({ request, response }) => {
  const routePath = request?.route?.path;
  if (typeof routePath === 'string' && !request[nsolid_route_s]) {
    // Compose full route path including mounted router prefixes
    const baseUrl = request.baseUrl || '';
    // Avoid double slashes when concatenating (e.g., baseUrl ends with / and routePath starts with /)
    const fullPath = baseUrl.endsWith('/') && routePath.startsWith('/') ?
      baseUrl + routePath.slice(1) :
      baseUrl + routePath;
    request[nsolid_route_s] = fullPath;
  }
});
