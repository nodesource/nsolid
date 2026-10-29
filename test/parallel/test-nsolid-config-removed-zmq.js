'use strict';

const common = require('../common');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const tmpdir = require('../common/tmpdir');

const removed = { command: 9001, data: 9002, bulk: 9003, pubkey: 'secret', disableIpv6: false };

function check(env, config, keys = [], setup = '') {
  const script = config === undefined ?
    `setTimeout(() => {}, ${common.platformTimeout(100)});` :
    `const nsolid = require('nsolid');
     nsolid.start(${JSON.stringify(config)});
     nsolid.start(${JSON.stringify(config)});`;
  const result = spawnSync(process.execPath, ['-e', setup + script], {
    env: { NSOLID_PACKAGE_JSON: '', ...env },
    encoding: 'utf8',
    timeout: common.platformTimeout(15000),
  });
  assert.ifError(result.error);
  assert.strictEqual(result.status, 0,
                     `signal=${result.signal}, stderr=${result.stderr}`);
  assert.strictEqual(result.stderr.split('[NSOLID_ZMQ_REMOVED]').length - 1,
                     keys.length ? 1 : 0);
  if (keys.length) {
    const settings = result.stderr.match(/agent was removed: (.+)\. Use NSOLID_GRPC/);
    assert.ok(settings, result.stderr);
    assert.deepStrictEqual(settings[1].split(', ').sort(), keys.slice().sort());
    assert.ok(result.stderr.includes('Use NSOLID_GRPC or NSOLID_SAAS'));
    assert.doesNotMatch(result.stderr, /secret/);
  }
}

// Ignored options must not invoke getters for their values.
check({}, undefined, ['command'],
      "require('nsolid').start({ get command() { throw new Error('secret'); } });");
check({}, undefined, ['command'],
      "require('nsolid').start(Object.create({ get command() { throw new Error('secret'); } }));");
check({}, undefined, [], 'delete Array.prototype[Symbol.iterator];');

check({}, undefined);
check({ NSOLID_COMMAND: '' }, undefined);
for (const key of [ 'NSOLID_COMMAND', 'NSOLID_COMMAND_REMOTE',
                    'NSOLID_DATA', 'NSOLID_DATA_REMOTE',
                    'NSOLID_BULK', 'NSOLID_BULK_REMOTE',
                    'NSOLID_PUBKEY', 'NSOLID_STORAGE_PUBKEY',
                    'NSOLID_DISABLE_IPV6' ]) {
  check({ [key]: 'secret' }, undefined, [key]);
}
for (const [key, value] of Object.entries(removed)) {
  check({}, { [key]: value }, [key]);
}

check({ NSOLID_COMMAND: 'secret' }, removed, ['NSOLID_COMMAND', ...Object.keys(removed)]);

tmpdir.refresh();
const packagePath = join(tmpdir.path, 'package.json');
writeFileSync(packagePath, JSON.stringify({ nsolid: removed }));
check({ NSOLID_PACKAGE_JSON: packagePath }, undefined, Object.keys(removed));
check({ NSOLID_PACKAGE_JSON: packagePath }, removed, Object.keys(removed));
