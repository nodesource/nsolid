'use strict';

// Regression test for checkTags() in lib/nsolid.js: when more than 20 tags
// are configured, only the first 20 (after sorting) should be kept, and any
// tag shorter than 2 bytes must be dropped, not just reported as a
// violation.

const common = require('../common');
const assert = require('assert');
const { spawn } = require('child_process');

if (process.argv[2]) {
  const nsolid = require('nsolid');
  nsolid.start();
  const info = nsolid.info();

  // The 26 configured tags (25 two-plus-byte tags plus a 1-byte one) must be
  // reduced to at most 20 entries.
  assert.ok(
    info.tags.length <= 20,
    `expected at most 20 tags, got ${info.tags.length}: ${info.tags}`,
  );

  // The 1-byte tag is a violation (tags must be 2 to 140 bytes) and must not
  // survive, regardless of where it sorts relative to the 20-tag cutoff.
  assert.ok(
    !info.tags.includes('x'),
    `expected the 1-byte tag "x" to be dropped, got: ${info.tags}`,
  );
} else {
  const tags = [];
  for (let i = 1; i <= 25; i++) {
    tags.push(`tag${String(i).padStart(2, '0')}`);
  }
  tags.push('x');

  const env = { ...process.env, NSOLID_TAGS: tags.join(',') };
  const child = spawn(process.execPath, [ __filename, 'child' ], {
    env,
    stdio: 'inherit',
  });
  child.on('exit', common.mustCall((code) => {
    assert.strictEqual(code, 0);
  }));
}
