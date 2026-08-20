'use strict';

require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

// Keep whatever the current initial value is when an invalid update arrives.
const initialRate = nsolid.config.traceSampleRate;
nsolid.start({
  command: 9001,
  traceSampleRate: 'invalid'
});
assert.strictEqual(nsolid.config.traceSampleRate, initialRate);

// Valid values should be persisted as-is.
nsolid.start({
  traceSampleRate: 0.4
});
assert.strictEqual(nsolid.config.traceSampleRate, 0.4);

// Invalid updates must preserve the previous valid value.
nsolid.start({
  traceSampleRate: 'still-invalid'
});
assert.strictEqual(nsolid.config.traceSampleRate, 0.4);

// Out-of-range updates must preserve the previous valid value.
nsolid.start({
  traceSampleRate: 2
});
assert.strictEqual(nsolid.config.traceSampleRate, 0.4);

nsolid.start({
  traceSampleRate: -0.5
});
assert.strictEqual(nsolid.config.traceSampleRate, 0.4);

nsolid.start({
  traceSampleRate: Number.NaN
});
assert.strictEqual(nsolid.config.traceSampleRate, 0.4);

nsolid.start({
  traceSampleRate: Number.POSITIVE_INFINITY
});
assert.strictEqual(nsolid.config.traceSampleRate, 0.4);

nsolid.start({
  traceSampleRate: true
});
assert.strictEqual(nsolid.config.traceSampleRate, 0.4);

nsolid.start({
  traceSampleRate: '   '
});
assert.strictEqual(nsolid.config.traceSampleRate, 0.4);

// Partial updates that omit traceSampleRate must not reset it.
nsolid.start({
  tracingEnabled: true
});
assert.strictEqual(nsolid.config.traceSampleRate, 0.4);
