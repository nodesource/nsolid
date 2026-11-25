'use strict';

const common = require('../../common');
if (!common.hasCrypto)
  common.skip('missing crypto');

const { hasOpenSSL, isBoringSSL } = require('../../common/crypto');
if (isBoringSSL || !hasOpenSSL(3))
  common.skip('requires OpenSSL 3');

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');

for (const [action, status] of [
  ['', 0],
  ['process.exit(7)', 7],
  // Prove that the hook is registered and observes explicit global cleanup.
  ['binding.cleanup()', 42],
]) {
  const script = `const binding = require('./build/${common.buildType}/binding'); ${action}`;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: __dirname, encoding: 'utf8', timeout: common.platformTimeout(15000),
  });
  assert.ifError(result.error);
  assert.strictEqual(result.signal, null, result.stderr);
  assert.strictEqual(result.status, status, result.stderr);
}
