import { platformTimeout } from '../common/index.mjs';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.argv[2] === 'child') {
  const { default: nsolid } = await import('nsolid');
  nsolid.start();
  nsolid.logger.info('not connected');
  const start = Date.now();
  while (Date.now() - start < 500);
  nsolid.profile(5000);
  nsolid.snapshot();
  setTimeout(() => process.exit(0), 200);
} else {
  const result = spawnSync(process.execPath,
                           [fileURLToPath(import.meta.url), 'child'], {
                             env: {
                               NSOLID_SAAS: `${'a'.repeat(40)}short.console.example:443`,
                               NSOLID_INTERVAL: '100',
                               NSOLID_BLOCKED_LOOP_THRESHOLD: '50',
                             },
                             encoding: 'utf8',
                             timeout: platformTimeout(15000),
                           });
  assert.ifError(result.error);
  assert.strictEqual(result.signal, null, result.stderr);
  assert.strictEqual(result.status, 0, result.stderr);
}
