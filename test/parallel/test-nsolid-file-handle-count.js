// Flags: --expose-gc
'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const fs = require('fs');

const baseOpened = nsolid.metrics().fsHandlesOpenedCount;
const baseClosed = nsolid.metrics().fsHandlesClosedCount;

function getOpened() {
  return nsolid.metrics().fsHandlesOpenedCount - baseOpened;
}

function getClosed() {
  return nsolid.metrics().fsHandlesClosedCount - baseClosed;
}

try {
  fs.openSync('/8hvftyuncxrt/path/to/file/that/does/not/exist', 'r');
} catch {
  // It's meant to throw and the exception is to be ignored.
}

assert.strictEqual(getOpened(), 0);
assert.strictEqual(getClosed(), 0);

const fd = fs.openSync(__filename);
assert.strictEqual(getOpened(), 1);
assert.strictEqual(getClosed(), 0);

fs.closeSync(fd);
assert.strictEqual(getOpened(), 1);
assert.strictEqual(getClosed(), 1);

fs.open(__filename, common.mustCall((err, fd) => {
  assert.ok(!err);
  assert.strictEqual(getOpened(), 2);
  assert.strictEqual(getClosed(), 1);

  fs.close(fd, common.mustCall((err) => {
    assert.ok(!err);
    assert.strictEqual(getOpened(), 2);
    assert.strictEqual(getClosed(), 2);

    checkPromise().then(common.mustCall(() => {
      openFileHandle();
      setTimeout(() => {
        // The FileHandle should be out-of-scope and no longer accessed now.
        global.gc();
        setImmediate(() => {
          assert.strictEqual(getOpened(), 4);
          assert.strictEqual(getClosed(), 4);
        });
      }, 100);
    })).catch(common.mustNotCall());
  }));
}));

async function checkPromise() {
  let fh = await fs.promises.open(__filename);
  assert.strictEqual(getOpened(), 3);
  assert.strictEqual(getClosed(), 2);
  fh = await fh.close();
  assert.strictEqual(fh, undefined);
  assert.strictEqual(getOpened(), 3);
  assert.strictEqual(getClosed(), 3);
}

async function openFileHandle() {
  const fh = await fs.promises.open(__filename);
  console.log(fh);
  assert.strictEqual(getOpened(), 4);
  assert.strictEqual(getClosed(), 3);
}
