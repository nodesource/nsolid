'use strict';
// Flags: --allow-natives-syntax --expose-internals --no-warnings

const common = require('../common');
const assert = require('assert');
const { internalBinding } = require('internal/test/binding');

const binding = internalBinding('nsolid_api');

function testFastWriteLog() {
  for (let i = 0; i < 10; i++) {
    binding.writeLog('nsolid fast api log line', 9);
  }
}

if (common.isDebug) {
  const { getV8FastApiCallCount } = internalBinding('debug');

  assert.strictEqual(getV8FastApiCallCount('nsolid.writeLog'), 0);

  eval('%PrepareFunctionForOptimization(testFastWriteLog)');
  testFastWriteLog();
  assert.strictEqual(getV8FastApiCallCount('nsolid.writeLog'), 0);

  eval('%OptimizeFunctionOnNextCall(testFastWriteLog)');
  testFastWriteLog();
  assert.strictEqual(getV8FastApiCallCount('nsolid.writeLog'), 10);
} else {
  eval('%PrepareFunctionForOptimization(testFastWriteLog)');
  testFastWriteLog();
  eval('%OptimizeFunctionOnNextCall(testFastWriteLog)');
  testFastWriteLog();
}
