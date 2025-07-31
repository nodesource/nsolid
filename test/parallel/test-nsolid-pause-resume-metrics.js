'use strict';

require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

nsolid.start();
assert.strictEqual(nsolid.config.pauseMetrics, false);
nsolid.pauseMetrics();
assert.strictEqual(nsolid.config.pauseMetrics, true);
nsolid.pauseMetrics();
assert.strictEqual(nsolid.config.pauseMetrics, true);
nsolid.resumeMetrics();
assert.strictEqual(nsolid.config.pauseMetrics, false);
nsolid.resumeMetrics();
assert.strictEqual(nsolid.config.pauseMetrics, false);
nsolid.pauseMetrics();
assert.strictEqual(nsolid.config.pauseMetrics, true);
