'use strict';

require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

const port = 9999;
nsolid.start({
  statsd: port
});

assert.strictEqual(nsolid.config.statsd, `localhost:${port}`);

nsolid.start({
  statsd: null
});

assert.strictEqual(nsolid.config.statsd, undefined);

nsolid.start({
  statsd: port
});

assert.strictEqual(nsolid.config.statsd, `localhost:${port}`);
