// Flags: --expose-internals
'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const { internalBinding } = require('internal/test/binding');
const { setTimeout: delay } = require('timers/promises');
const binding = internalBinding('nsolid_api');

// Valid values should be normalized and persisted.
nsolid.start({
  command: 9001,
  interval: '2500'
});
assert.strictEqual(nsolid.config.interval, 2500);

// Invalid updates must preserve the previous valid value.
for (const interval of [
  0,
  -1,
  0.5,
  1.5,
  Number.MAX_SAFE_INTEGER + 1,
  '0',
  '-1',
  '0.5',
  '',
  '   ',
  'still-invalid',
  Number.NaN,
  Number.POSITIVE_INFINITY,
  true,
]) {
  nsolid.start({ interval });
  assert.strictEqual(nsolid.config.interval, 2500);
}

// Partial updates that omit interval must not reset it.
nsolid.start({
  tracingEnabled: true
});
assert.strictEqual(nsolid.config.interval, 2500);

// Native updates bypass JavaScript validation, as remote reconfiguration does.
for (const interval of [0, -1, 0.5, 1.5, Number.MAX_SAFE_INTEGER + 1,
                        '2500', true, null]) {
  binding.updateConfig(JSON.stringify({ interval, tags: ['interval-test'] }));
  assert.strictEqual(nsolid.config.interval, 2500);
}

async function waitForDnsMedian(value) {
  for (let i = 0; i < 200; i++) {
    binding.pushDnsBucket(value);
    await delay(50);
    if (nsolid.metrics().dnsMedian === value)
      return;
  }
  assert.fail(`DNS percentile collection stopped: expected ${value}`);
}

(async () => {
  nsolid.start({ interval: 50 });
  await waitForDnsMedian(123);
  binding.updateConfig(JSON.stringify({ interval: 0, tags: ['invalid-interval'] }));
  await delay(200);
  binding.updateConfig(JSON.stringify({ interval: 50 }));
  await waitForDnsMedian(456);
})().then(common.mustCall());
