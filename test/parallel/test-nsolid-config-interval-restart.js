// Flags: --expose-internals
'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const { internalBinding } = require('internal/test/binding');
const { setTimeout: delay } = require('timers/promises');
const binding = internalBinding('nsolid_api');

async function waitForDnsMedian(value) {
  for (let i = 0; i < 100; i++) {
    binding.pushDnsBucket(value, '', '');
    await delay(50);
    if (nsolid.metrics().dnsMedian === value)
      return;
  }
  assert.fail(`DNS percentile collection did not resume: expected ${value}`);
}

(async () => {
  nsolid.start({ interval: 50 });
  await waitForDnsMedian(123);

  nsolid.start({ interval: 3600000 });
  await delay(250);

  // Native updates take the same path as remote reconfiguration.
  binding.updateConfig(JSON.stringify({ interval: 50 }));
  assert.strictEqual(nsolid.config.interval, 50);
  await waitForDnsMedian(456);
})().then(common.mustCall());
