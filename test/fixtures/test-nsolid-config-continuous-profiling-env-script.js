'use strict';

// This script is used by test-nsolid-config-continuous-profiling-env.js
// to test environment variable configuration

require('../common');
const nsolid = require('nsolid');

// Start N-Solid with default configuration
nsolid.start();

// Output the configuration as JSON
console.log(JSON.stringify({
  contCpuProfile: nsolid.config.contCpuProfile,
  contCpuProfileInterval: nsolid.config.contCpuProfileInterval,
  contHeapProfile: nsolid.config.contHeapProfile,
  contHeapProfileInterval: nsolid.config.contHeapProfileInterval
}));
