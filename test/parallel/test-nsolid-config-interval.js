'use strict';

require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

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
  '0',
  '-1',
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
