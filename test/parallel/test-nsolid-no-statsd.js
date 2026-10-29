// Flags: --expose-internals
'use strict';

const common = require('../common');
const assert = require('node:assert');
const nsolid = require('nsolid');
const { spawnSync } = require('node:child_process');
const { internalBinding } = require('internal/test/binding');

assert.strictEqual(nsolid.statsd, undefined);
assert.throws(() => internalBinding('nsolid_statsd_agent'), /No such binding/);

process.env.NSOLID_STATSD = 'localhost:8125';
process.env.NSOLID_STATSD_BUCKET = 'removed';
process.env.NSOLID_STATSD_TAGS = 'removed';
nsolid.start({ statsd: 'localhost:8125', statsdBucket: 'removed', statsdTags: 'removed' });
for (const key of ['statsd', 'statsdBucket', 'statsdTags']) {
  assert.strictEqual(nsolid.config[key], undefined);
}

if (process.argv[2] !== 'child') {
  const result = spawnSync(process.execPath,
                           ['--expose-internals', __filename, 'child'], {
                             env: {
                               ...process.env,
                               NSOLID_STATSD: 'localhost:8125',
                               NSOLID_STATSD_BUCKET: 'removed',
                               NSOLID_STATSD_TAGS: 'removed',
                             },
                             encoding: 'utf8',
                             timeout: common.platformTimeout(15000),
                           });
  assert.ifError(result.error);
  assert.strictEqual(result.status, 0, result.stderr);
}
