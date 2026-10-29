// Flags: --expose-internals
'use strict';

require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

// Test CPU continuous profiling configuration
nsolid.start({
  grpc: 9001,
  contCpuProfile: true,
  contCpuProfileInterval: 60000
});

assert.strictEqual(nsolid.config.contCpuProfile, true);
assert.strictEqual(nsolid.config.contCpuProfileInterval, 60000);

// Test changing CPU continuous profiling configuration
nsolid.start({
  contCpuProfile: false,
  contCpuProfileInterval: 120000
});

assert.strictEqual(nsolid.config.contCpuProfile, false);
assert.strictEqual(nsolid.config.contCpuProfileInterval, 120000);

// Test enabling CPU continuous profiling
nsolid.start({
  contCpuProfile: true
});

assert.strictEqual(nsolid.config.contCpuProfile, true);
assert.strictEqual(nsolid.config.contCpuProfileInterval, 120000);

// Test type coercion for boolean values
nsolid.start({
  contCpuProfile: 'true',
});

assert.strictEqual(nsolid.config.contCpuProfile, true);

// Test type coercion for interval values
nsolid.start({
  contCpuProfileInterval: '45000',
});

assert.strictEqual(nsolid.config.contCpuProfileInterval, 45000);

// Test disabling CPU profiling
nsolid.start({
  contCpuProfile: false,
});

assert.strictEqual(nsolid.config.contCpuProfile, false);


for (const interval of [0, -1, NaN, Infinity, 1.5,
                        Number.MAX_SAFE_INTEGER + 1, 'abc', null]) {
  nsolid.start({ contCpuProfileInterval: interval });
  assert.strictEqual(nsolid.config.contCpuProfileInterval, 45000);
  console.log(`Rejected CPU profiling interval: ${interval}`);
}
const { internalBinding } = require('internal/test/binding');
for (const interval of [0, -1, 1.5, 'abc', null]) {
  internalBinding('nsolid_api').updateConfig(JSON.stringify({
    contCpuProfileInterval: interval,
  }));
  assert.strictEqual(nsolid.config.contCpuProfileInterval, 45000);
}
