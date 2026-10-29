// Flags: --expose-internals
'use strict';

const common = require('../common');
const assert = require('node:assert');
const nsolid = require('nsolid');
const { spawnSync } = require('node:child_process');
const { internalBinding } = require('internal/test/binding');

assert.strictEqual(nsolid.zmq, undefined);
assert.strictEqual(process.versions.zmq, undefined);
assert.strictEqual(process.versions.sodium, undefined);
assert.throws(() => internalBinding('nsolid_zmq_agent'), /No such binding/);

process.env.NSOLID_COMMAND = 'localhost:9001';
process.env.NSOLID_DATA = 'localhost:9002';
process.env.NSOLID_BULK = 'localhost:9003';
process.env.NSOLID_PUBKEY = 'removed';
nsolid.start({ command: 9001, data: 9002, bulk: 9003, pubkey: 'removed', disableIpv6: true });
for (const key of ['command', 'data', 'bulk', 'pubkey', 'disableIpv6']) {
  assert.strictEqual(nsolid.config[key], undefined);
}

for (const name of ['profile', 'heapProfile', 'heapSampling', 'snapshot']) {
  assert.throws(() => nsolid[name](), { code: 1006 });
  nsolid[name](common.mustCall((err) => {
    assert.strictEqual(err.code, 1006);
  }));
}

if (process.argv[2] !== 'child') {
  const result = spawnSync(process.execPath,
                           ['--expose-internals', __filename, 'child'], {
                             env: {
                               ...process.env,
                               NSOLID_COMMAND: 'localhost:9001',
                               NSOLID_DATA: 'localhost:9002',
                               NSOLID_BULK: 'localhost:9003',
                               NSOLID_PUBKEY: 'removed',
                             },
                             encoding: 'utf8',
                             timeout: common.platformTimeout(15000),
                           });
  assert.ifError(result.error);
  assert.strictEqual(result.status, 0, result.stderr);
}
