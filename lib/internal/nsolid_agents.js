'use strict';

const binding = internalBinding('nsolid_api');
const { isMainThread } = internalBinding('worker');
// Simply require this here in order to initialize it.
require('internal/agents/statsd/lib/nsolid');
require('internal/agents/zmq/lib/nsolid');

if (isMainThread && process.env.DD_RUNTIME_METRICS_ENABLED === 'true') {
  enableDDRuntimeMetrics();
}


function enableDDRuntimeMetrics() {
  const host = process.env.DD_DOGSTATSD_HOSTNAME || 'localhost';
  const port = process.env.DD_DOGSTATSD_PORT || 8125;

  binding._setupDogStatsD(`udp://${host}:${port}`);
}
