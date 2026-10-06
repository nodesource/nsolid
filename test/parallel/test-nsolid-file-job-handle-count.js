'use strict';

const common = require('../common');
const tmpdir = require('../common/tmpdir');
const assert = require('assert');
const fs = require('fs');
const { promisify } = require('util');
const nsolid = require('nsolid');

tmpdir.refresh();
const file = tmpdir.resolve('file');

async function check(operation, opened, closed) {
  const before = nsolid.metrics();
  await operation();
  const after = nsolid.metrics();
  assert.strictEqual(after.fsHandlesOpenedCount - before.fsHandlesOpenedCount,
                     opened);
  assert.strictEqual(after.fsHandlesClosedCount - before.fsHandlesClosedCount,
                     closed);
}

async function test() {
  for (const api of [
    { readFile: promisify(fs.readFile), writeFile: promisify(fs.writeFile) },
    fs.promises,
  ]) {
    await check(() => api.writeFile(file, 'data'), 1, 1);
    await check(() => api.readFile(file), 1, 1);
    // Larger than the one-shot limit: the chunked reader closes the fd.
    fs.truncateSync(file, 1024 * 1024);
    await check(() => api.readFile(file), 1, 1);
    await check(() => assert.rejects(api.readFile(tmpdir.resolve('missing')),
                                    { code: 'ENOENT' }), 0, 0);
    await check(() => assert.rejects(api.writeFile(tmpdir.resolve('missing/file'),
                                                 'data'),
                                    { code: 'ENOENT' }), 0, 0);
  }
}

test().then(common.mustCall());
