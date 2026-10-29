'use strict';

const common = require('../common');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const nsolid = require('nsolid');

const token = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxexample.org:9001';

if (process.argv[2] === 'child') {
  if (process.argv[3])
    nsolid.start(JSON.parse(process.argv[3]));
  process.stdout.write(JSON.stringify(nsolid.config));
  return;
}

const cases = [
  [{ NSOLID_SAAS: token }, undefined, token, undefined],
  [{ NSOLID_SAAS: token, NSOLID_COMMAND: '9001' }, undefined, token, undefined],
  [{ NSOLID_SAAS: token, NSOLID_GRPC: '9001' }, undefined, token, '9001'],
  [{ NSOLID_SAAS: 'invalid' }, undefined, undefined, undefined],
  [{ NSOLID_SAAS: 'invalid', NSOLID_GRPC: '9001' }, undefined, undefined, 'localhost:9001'],
  [{}, { saas: token }, token, undefined],
  [{}, { saas: token, grpc: 9001 }, token, 'localhost:9001'],
  [{ NSOLID_SAAS: token }, { command: 9001 }, token, undefined],
  [{}, { saas: 'invalid', grpc: 9001 }, undefined, 'localhost:9001'],
];

for (const [env, config, saas, grpc] of cases) {
  const args = [__filename, 'child'];
  if (config)
    args.push(JSON.stringify(config));
  const result = spawnSync(process.execPath, args, {
    env,
    encoding: 'utf8',
    timeout: common.platformTimeout(15000),
  });
  assert.ifError(result.error);
  assert.strictEqual(result.status, 0, result.stderr);
  const actual = JSON.parse(result.stdout);
  assert.strictEqual(actual.saas, saas);
  assert.strictEqual(actual.grpc, grpc);
  assert.strictEqual(actual.command, undefined);
}
