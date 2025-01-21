'use strict';

const nsolidApi = internalBinding('nsolid_api');
const {
  nsolid_counts,
  nsolid_tracer_s,
  nsolid_consts,
} = nsolidApi;

const { now } = require('internal/perf/utils');

const dc = require('diagnostics_channel');

const {
  kHttpClientAbortCount,
  kHttpClientCount,
  kHttpServerAbortCount,
  kHttpServerCount,
} = nsolid_consts;

// To lazy load the http2 constants
let http2Constants;

dc.subscribe('undici:request:create', ({ request }) => {
  request[nsolid_tracer_s] = now();
});

dc.subscribe('undici:request:headers', ({ request }) => {
  nsolid_counts[kHttpClientCount]++;
  nsolidApi.pushClientBucket(now() - request[nsolid_tracer_s]);
});

dc.subscribe('undici:request:error', () => {
  nsolid_counts[kHttpClientAbortCount]++;
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
