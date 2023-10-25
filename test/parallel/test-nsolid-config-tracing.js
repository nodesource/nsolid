'use strict';

require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

nsolid.start({
  command: 9001,
  tracingEnabled: true
});

assert.strictEqual(nsolid.config.tracingEnabled, true);
nsolid.start({
  tracingEnabled: false
});

assert.strictEqual(nsolid.config.tracingEnabled, false);
nsolid.start({
  tracingEnabled: true
});

assert.strictEqual(nsolid.config.tracingEnabled, true);
