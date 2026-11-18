// Flags: --expose-internals --no-warnings --allow-natives-syntax
'use strict';

const common = require('../common');
const assert = require('assert');
const { internalBinding } = require('internal/test/binding');
const binding = internalBinding('nsolid_api');

function getWallTime() {
  return binding.getWallTime();
}

function checkWallTime() {
  const before = Date.now();
  const time = getWallTime();
  const after = Date.now();
  // V8's interpolated Windows clock retains a coarse initial epoch anchor.
  const tolerance = common.isWindows ? 20 : 1;
  assert.ok(Number.isFinite(time));
  assert.ok(time >= before - tolerance && time <= after + tolerance);
}

eval('%PrepareFunctionForOptimization(getWallTime)');
checkWallTime();
// V8 only optimizes double-return fast calls on these architectures.
const hasFastDoubleReturn = [
  'x64', 'arm64', 'mips64el', 'loong64', 'riscv64',
].includes(process.arch);
const getCount = common.isDebug && hasFastDoubleReturn ?
  internalBinding('debug').getV8FastApiCallCount : undefined;
const before = getCount?.('nsolid.getWallTime');
eval('%OptimizeFunctionOnNextCall(getWallTime)');
checkWallTime();
if (getCount) {
  assert.strictEqual(getCount('nsolid.getWallTime'), before + 1);
}
