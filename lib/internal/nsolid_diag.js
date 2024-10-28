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
} = nsolid_consts;

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
