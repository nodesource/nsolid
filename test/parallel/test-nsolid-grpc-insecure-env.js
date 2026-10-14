'use strict';
const common = require('../common');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');

for (const [value, insecure, warning] of [
  ['1', true, false], ['0', false, false],
  ['true', true, false], ['TRUE', true, false],
  ['false', false, false], ['FaLsE', false, false],
  ['', false, false],
  ['yes', false, true], ['on', false, true],
  ['no', false, true], ['off', false, true],
  ['invalid', false, true], ['1abc', false, true],
  ['9999999999999999999999999999999999999', false, true],
]) {
  const result = spawnSync(process.execPath, ['-e',
                                              "setTimeout(() => require('nsolid').start(" +
                                              "{ grpc: '127.0.0.1:2' }), 250);" +
                                              "setTimeout(() => console.log('still alive'), 500)"], {
    env: { ...process.env, NSOLID_GRPC: '127.0.0.1:1',
           NSOLID_GRPC_INSECURE: value, NSOLID_SAAS: '', NSOLID_COMMAND: '',
           NODE_DEBUG_NATIVE: 'nsolid_grpc_agent' },
    encoding: 'utf8', timeout: common.platformTimeout(15000),
  });
  console.log(`NSOLID_GRPC_INSECURE=${value}: TLS=${!insecure}`);
  console.error(result.stderr);
  assert.ifError(result.error);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.signal, null);
  assert.ok(result.stdout.includes('still alive'));
  assert.ok(result.stderr.includes(`Insecure: ${insecure ? 1 : 0}`));
  assert.ok(result.stderr.includes('Endpoint: 127.0.0.1:1.'));
  assert.ok(result.stderr.includes('Endpoint: 127.0.0.1:2.'));
  assert.strictEqual(
    (result.stderr.match(/invalid NSOLID_GRPC_INSECURE/g) || []).length,
    warning ? 1 : 0);
}
