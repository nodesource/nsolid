'use strict';

require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const tmpdir = require('../common/tmpdir');

tmpdir.refresh();
for (const [pkgValue, envValue, expected] of [
  [undefined, undefined, false],
  [true, undefined, true],
  [false, '1', true],
  [true, '0', false],
  [undefined, '1', true],
  [true, '', false],
  ['', undefined, false],
  [true, 'no', false],
  [true, 'off', false],
  [true, 'False', false],
  ['no', undefined, false],
  ['TRUE', undefined, true],
  [false, 'True', true],
]) {
  fs.writeFileSync(path.join(tmpdir.path, 'package.json'), JSON.stringify({
    nsolid: { sourceCodeEnabled: pkgValue },
  }));
  const env = { ...process.env };
  delete env.NSOLID_SOURCE_CODE_ENABLED;
  if (envValue !== undefined)
    env.NSOLID_SOURCE_CODE_ENABLED = envValue;
  const child = spawnSync(process.execPath, ['-e', `
    const assert = require('assert');
    const nsolid = require('nsolid');
    nsolid.start();
    assert.strictEqual(nsolid.sourceCodeEnabled, ${expected});
    nsolid.start({ sourceCodeEnabled: ${!expected} });
    assert.strictEqual(nsolid.sourceCodeEnabled, ${!expected});
  `], {
    cwd: tmpdir.path,
    env,
    encoding: 'utf8',
  });
  assert.strictEqual(child.status, 0, child.stderr);
}

assert.strictEqual(nsolid.sourceCodeEnabled, false);
nsolid.start();
assert.strictEqual(nsolid.config.sourceCodeEnabled, false);

nsolid.start({ sourceCodeEnabled: true });
assert.strictEqual(nsolid.sourceCodeEnabled, true);
assert.strictEqual(nsolid.config.sourceCodeEnabled, true);

nsolid.start({ blockedLoopThreshold: 250 });
assert.strictEqual(nsolid.sourceCodeEnabled, true);

nsolid.start({ sourceCodeEnabled: {} });
assert.strictEqual(nsolid.sourceCodeEnabled, true);

nsolid.start({ sourceCodeEnabled: false });
assert.strictEqual(nsolid.sourceCodeEnabled, false);
assert.strictEqual(nsolid.config.sourceCodeEnabled, false);

nsolid.start({ sourceCodeEnabled: {} });
assert.strictEqual(nsolid.sourceCodeEnabled, false);

for (const [value, expected] of [
  ['no', false],
  ['off', false],
  ['False', false],
  ['TRUE', true],
  ['1', true],
]) {
  nsolid.start({ sourceCodeEnabled: !expected });
  nsolid.start({ sourceCodeEnabled: value });
  assert.strictEqual(nsolid.sourceCodeEnabled, expected);
}
