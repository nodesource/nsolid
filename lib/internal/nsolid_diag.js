'use strict';

const nsolidApi = internalBinding('nsolid_api');
const {
  nsolid_counts,
  nsolid_span_id_s,
  nsolid_tracer_s,
  nsolid_consts,
} = nsolidApi;

const { now } = require('internal/perf/utils');
const { URL } = require('internal/url');
const {
  getApi,
} = require('internal/otel/core');

const {
  generateSpan,
} = require('internal/nsolid_trace');

const dc = require('diagnostics_channel');

const {
  kHttpClientAbortCount,
  kHttpClientCount,
  kSpanHttpClient,
  kSpanHttpMethod,
  kSpanHttpReqUrl,
  kSpanHttpStatusCode,
} = nsolid_consts;

dc.subscribe('undici:request:create', ({ request }) => {
  request[nsolid_tracer_s] = now();
  if (generateSpan(kSpanHttpClient)) {
    const api = getApi();
    const tracer = api.trace.getTracer('http');
    const span = tracer.startSpan(`HTTP ${request.method}`,
                                  { internal: true,
                                    kind: api.SpanKind.CLIENT,
                                    type: kSpanHttpClient });
    request[nsolid_span_id_s] = span;
    const requestUrl = new URL(request.origin + request.path);
    span._pushSpanDataString(kSpanHttpMethod, request.method);
    span._pushSpanDataString(kSpanHttpReqUrl, requestUrl.toString());
    const { spanId, traceId } = span.spanContext();
    if (span._isSampled()) {
      request.addHeader('traceparent', `00-${traceId}-${spanId}-01`);
    } else {
      request.addHeader('traceparent', `00-${traceId}-${spanId}-00`);
    }
  }
});

dc.subscribe('undici:request:headers', ({ request, response }) => {
  nsolid_counts[kHttpClientCount]++;
  nsolidApi.pushClientBucket(now() - request[nsolid_tracer_s]);
  const span = request[nsolid_span_id_s];
  if (span && generateSpan(kSpanHttpClient)) {
    span._pushSpanDataUint64(kSpanHttpStatusCode, response.statusCode);
    if (response.statusCode >= 400) {
      span.setStatus({ code: getApi().SpanStatusCode.ERROR });
    }
  }
});

dc.subscribe('undici:request:trailers', ({ request }) => {
  const span = request[nsolid_span_id_s];
  if (span && generateSpan(kSpanHttpClient)) {
    span.end();
  }
});

dc.subscribe('undici:request:error', ({ request, error }) => {
  nsolid_counts[kHttpClientAbortCount]++;
  const span = request[nsolid_span_id_s];
  if (span && generateSpan(kSpanHttpClient)) {
    span.recordException(error);
    span.setStatus({
      code: getApi().SpanStatusCode.ERROR,
      message: error.message,
    });
    span.end();
  }
});
