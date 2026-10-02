'use strict';

// NSOLID_PERMISSION_AUDIT enables the permission model in audit mode without
// restricting the process.

require('../common');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fixtures = require('../common/fixtures');

const file = fixtures.path('a.js');

function run(execArgv, env, code) {
  return spawnSync(process.execPath, [...execArgv, '-e', code], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function assertOk(result) {
  assert.strictEqual(result.stderr, '');
  assert.strictEqual(result.status, 0);
}

{
  // Without NSOLID_PERMISSION_AUDIT the permission model is disabled.
  for (const value of [undefined, '0', 'false']) {
    const env = value === undefined ? {} : { NSOLID_PERMISSION_AUDIT: value };
    assertOk(run([], env, 'assert.strictEqual(process.permission, undefined)'));
  }
}

{
  // Denied operations are audited but not blocked, and process.binding(),
  // the path module and the inspector keep working.
  const code = `
    assert.strictEqual(typeof process.permission.has, 'function');
    assert.strictEqual(process.permission.has('fs.read', ${JSON.stringify(file)}), false);
    require('node:fs').readFileSync(${JSON.stringify(file)});
    assert.strictEqual(typeof process.binding('util'), 'object');
    assert.strictEqual(Object.isFrozen(require('node:path')), false);
    if (process.features.inspector) {
      const inspector = require('node:inspector');
      inspector.open(0, '127.0.0.1', false);
      assert.match(inspector.url(), /^ws:/);
      inspector.close();
    }
  `;
  assertOk(run([], { NSOLID_PERMISSION_AUDIT: '1' }, code));
  assertOk(run([], { NSOLID_PERMISSION_AUDIT: 'true' }, code));
}

{
  // --permission takes precedence over NSOLID_PERMISSION_AUDIT.
  const result = run(['--permission'], { NSOLID_PERMISSION_AUDIT: '1' },
                     `require('node:fs').readFileSync(${JSON.stringify(file)})`);
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /ERR_ACCESS_DENIED/);
}

{
  // --permission-audit keeps restricting process.binding().
  const result = run(['--permission-audit'], {}, 'process.binding("util")');
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /ERR_ACCESS_DENIED/);
}
