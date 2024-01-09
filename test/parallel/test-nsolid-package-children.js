'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const path = require('path');
const fs = require('fs');

let children_count = 0;

common.skipIfEslintMissing();

assert.ok(nsolid.packages().filter((e) => e.name[0] === '@').length > 0);

// Require some modules located in core for package testing.
require('../../tools/node_modules/eslint');

const packages = nsolid.packages();

const checkEslint = common.mustCall(function(p) {
  assert.ok(p.required);
  assert.ok(Array.isArray(p.children));
  assert.ok(p.children.length > 0);
  checkChildrenPaths(p);
});

function checkChildrenPaths(p) {
  assert.ok(p.children.length > 0);

  // Make sure child relative paths to package actually exist.
  for (const c of p.children) {
    assert.ok(fs.existsSync(path.join(p.path, c)));
  }
}

for (const p of packages) {
  if (p.name === 'eslint')
    checkEslint(p);
  else
    children_count++;
}

// The +1 is to account for the required module above.
assert.strictEqual(children_count + 1, packages.length);
