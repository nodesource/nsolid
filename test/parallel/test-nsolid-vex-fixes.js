'use strict';

// tools/vex/exceptions.json marks some CVEs fixed because N|Solid patches its
// copy of a package in place, so scanners still see the vulnerable version.
// Each such statement lists strings that only the patched files contain.
// When an update replaces a patched file, patch it again or change the
// statement.

require('../common');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const exceptions = JSON.parse(
  fs.readFileSync(path.join(root, 'tools', 'vex', 'exceptions.json'), 'utf8'));

let checks = 0;
for (const { cve, verify = [] } of exceptions) {
  for (const { path: file, contains } of verify) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(text.includes(contains),
              `${cve}: ${file} no longer contains ${JSON.stringify(contains)}`);
    checks++;
  }
}
assert.ok(checks > 0);
