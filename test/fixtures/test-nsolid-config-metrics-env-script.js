'use strict';

// This script is used by test-nsolid-config-metrics-env.js
// to test environment variable configuration for metrics batch/buffer size

require('../common');
const nsolid = require('nsolid');

// Start N|Solid with default configuration so initializeConfig() runs
nsolid.start();

// Output the configuration as JSON
console.log(JSON.stringify({
  metricsBatchSize: nsolid.config.metricsBatchSize,
  metricsBufferSize: nsolid.config.metricsBufferSize,
}));
