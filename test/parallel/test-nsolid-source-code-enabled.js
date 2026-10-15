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
  [true, '', true],
  ['', undefined, false],
  [true, 'no', true],
  [true, 'off', true],
  [true, 'False', true],
  ['no', undefined, true],
  ['TRUE', undefined, true],
  [false, 'True', true],
  ['yes', undefined, true],
  [undefined, 'bogus', true],
  [true, 'bogus', true],
  [undefined, '  true  ', true],
  [undefined, 'ON', true],
  ['bogus', undefined, true],
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
  ['no', true],
  ['off', true],
  ['False', true],
  ['TRUE', true],
  ['1', true],
  ['yes', true],
  ['OFF', true],
  ['false', false],
  ['0', false],
  [NaN, true],
]) {
  nsolid.start({ sourceCodeEnabled: !expected });
  nsolid.start({ sourceCodeEnabled: value });
  assert.strictEqual(nsolid.sourceCodeEnabled, expected);
}

for (const expected of [true, false]) {
  nsolid.start({ sourceCodeEnabled: expected });
  for (const value of ['', null, undefined, {}, []]) {
    nsolid.start({ sourceCodeEnabled: value });
    assert.strictEqual(nsolid.sourceCodeEnabled, expected);
  }
}
