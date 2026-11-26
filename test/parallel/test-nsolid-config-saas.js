'use strict';

const common = require('../common');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const nsolid = require('nsolid');

const token = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxexample.org:9001';

if (process.argv[2] === 'child') {
  // Start now so the rejection warning is printed before the child exits.
  nsolid.start(process.argv[3] ? JSON.parse(process.argv[3]) : undefined);
  process.stdout.write(JSON.stringify(nsolid.config));
  return;
}

const cases = [
  [{ NSOLID_SAAS: token }, undefined, token, undefined],
  [{ NSOLID_SAAS: token, NSOLID_COMMAND: '9001' }, undefined, token, undefined],
  [{ NSOLID_SAAS: token, NSOLID_GRPC: '9001' }, undefined, token, 'localhost:9001'],
  [{ NSOLID_SAAS: 'invalid' }, undefined, undefined, undefined],
  [{ NSOLID_SAAS: 'invalid', NSOLID_GRPC: '9001' }, undefined, undefined, 'localhost:9001'],
  [{}, { saas: token }, token, undefined],
  [{}, { saas: token, grpc: 9001 }, token, 'localhost:9001'],
  [{ NSOLID_SAAS: token }, { command: 9001 }, token, undefined],
  [{}, { saas: 'invalid', grpc: 9001 }, undefined, 'localhost:9001'],
  [{ NSOLID_SAAS: token, NSOLID_GRPC: 'console.example' }, undefined, token, 'console.example'],
  [{}, { saas: token, grpc: 'console.example' }, token, 'console.example'],
  [{}, { saas: token, grpc: 'console.example:80' }, token, 'console.example:80'],
  [{}, { saas: token, grpc: '[::1]' }, token, '[::1]'],
  // The dial target is the parsed hostname: gRPC doesn't convert IDNs.
  [{}, { saas: token, grpc: 'M\u00fcnchen.example' }, token, 'xn--mnchen-3ya.example'],
  [{}, { saas: token, grpc: 'Console.Example:443' }, token, 'console.example:443'],
  // A bare port means localhost, never an IPv4 address such as 0.0.0.0.
  [{}, { saas: token, grpc: '9001' }, token, 'localhost:9001'],
  [{ NSOLID_SAAS: token, NSOLID_GRPC: '0' }, undefined, token, undefined, true],
  [{}, { saas: token, grpc: '0' }, token, undefined, true],
  [{ NSOLID_SAAS: token, NSOLID_GRPC: '0x10' }, undefined, token, undefined, true],
  [{}, { saas: token, grpc: 'console.example:0' }, token, undefined, true],
  // A rejected address is hidden from the config and never falls back to the
  // token's endpoint.
  [{ NSOLID_SAAS: token, NSOLID_GRPC: 'localhost:70000' }, undefined, token, undefined, true],
  [{ NSOLID_GRPC: 'bad host:1' }, { saas: token }, token, undefined, true],
  [{}, { saas: token, grpc: 'bad host:1' }, token, undefined, true],
  [{}, { saas: token, grpc: 'console.example:80\x01' }, token, undefined, true],
];

const kRejectedWarning = 'N|Solid warning: invalid grpc address';

for (const [env, config, saas, grpc, warns = false] of cases) {
  const args = [__filename, 'child'];
  if (config)
    args.push(JSON.stringify(config));
  const result = spawnSync(process.execPath, args, {
    env,
    encoding: 'utf8',
    timeout: common.platformTimeout(15000),
  });
  assert.ifError(result.error);
  assert.strictEqual(result.status, 0,
                     `${JSON.stringify({ env, config })}: ` +
                     `signal=${result.signal}, stderr=${result.stderr}`);
  const actual = JSON.parse(result.stdout);
  assert.strictEqual(actual.saas, saas);
  assert.strictEqual(actual.grpc, grpc);
  assert.strictEqual(actual.command, undefined);
  assert.strictEqual(result.stderr.includes(kRejectedWarning), warns);
}
