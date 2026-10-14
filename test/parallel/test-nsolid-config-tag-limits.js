'use strict';
const common = require('../common');
const assert = require('node:assert');
const nsolid = require('nsolid');
const { spawnSync } = require('node:child_process');

const tags = Array.from({ length: 25 }, (_, i) => `tag${String(i).padStart(2, '0')}`);
nsolid.start({ tags: [...tags, 'x'] });
assert.deepStrictEqual(nsolid.config.tags, tags.slice(0, 20));
assert.deepStrictEqual(nsolid.info().tags, tags.slice(0, 20));
console.log(`Enforced tag count: ${nsolid.config.tags.length}`);

nsolid.start({ tags: ['a', ...tags.slice(0, 21)] });
assert.deepStrictEqual(nsolid.config.tags, tags.slice(0, 20));
assert.deepStrictEqual(nsolid.info().tags, tags.slice(0, 20));

nsolid.start({ tags: ['x', 'ok', 'é', 'a'.repeat(139) + 'é', '😀'.repeat(36)] });
assert.ok(!nsolid.config.tags.includes('x'));
assert.ok(nsolid.config.tags.includes('é'));
assert.ok(nsolid.config.tags.includes('a'.repeat(139)));
assert.ok(nsolid.config.tags.includes('😀'.repeat(35)));
for (const tag of nsolid.config.tags) {
  assert.ok(Buffer.byteLength(tag) >= 2 && Buffer.byteLength(tag) <= 140);
  assert.ok(!tag.includes('\uFFFD'));
}
console.log('Tag byte limits retain complete UTF-8 characters');

const result = spawnSync(process.execPath, ['-e',
                                            "console.log(JSON.stringify(require('nsolid').config.tags))"], {
  env: { ...process.env, NSOLID_TAGS: tags.join(',') },
  encoding: 'utf8', timeout: common.platformTimeout(15000),
});
assert.ifError(result.error);
assert.strictEqual(result.status, 0);
assert.deepStrictEqual(JSON.parse(result.stdout.trim()), tags.slice(0, 20));
console.error(result.stderr);
