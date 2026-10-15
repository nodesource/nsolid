'use strict';
const common = require('../common');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'lib/nsolid.js'), 'utf8');
const manpage = fs.readFileSync(path.join(root, 'doc/nsolid.1'), 'utf8');
const result = spawnSync(process.execPath, ['--help'], {
  encoding: 'utf8', timeout: common.platformTimeout(15000),
});
assert.ifError(result.error);
assert.strictEqual(result.status, 0);
for (const [, name] of source.matchAll(/process\.env\.(NSOLID_[A-Z0-9_]+)/g)) {
  assert.ok(result.stdout.includes(name), `Missing --help entry: ${name}`);
  assert.ok(manpage.includes(name), `Missing manpage entry: ${name}`);
}
console.log('N|Solid environment variables are covered by --help and the manpage');
