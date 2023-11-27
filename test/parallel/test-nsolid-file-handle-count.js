// Flags: --expose-gc
'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const fs = require('fs');

const baseOpened = nsolid.metrics().fsHandlesOpenedCount;
const baseClosed = nsolid.metrics().fsHandlesClosedCount;

let oCntr = 0;
let cCntr = 0;

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

assert.strictEqual(getOpened(), oCntr);
assert.strictEqual(getClosed(), cCntr);

const fd = fs.openSync(__filename);
assert.strictEqual(getOpened(), ++oCntr);
assert.strictEqual(getClosed(), cCntr);

fs.closeSync(fd);
assert.strictEqual(getOpened(), oCntr);
assert.strictEqual(getClosed(), ++cCntr);

fs.readFileSync(__filename);
assert.strictEqual(getOpened(), ++oCntr);
assert.strictEqual(getClosed(), ++cCntr);

fs.readFile(__filename, () => {
  assert.strictEqual(getOpened(), ++oCntr);
  assert.strictEqual(getClosed(), ++cCntr);

  fs.open(__filename, common.mustCall((err, fd) => {
    assert.ok(!err);
    assert.strictEqual(getOpened(), ++oCntr);
    assert.strictEqual(getClosed(), cCntr);

    fs.close(fd, common.mustCall((err) => {
      assert.ok(!err);
      assert.strictEqual(getOpened(), oCntr);
      assert.strictEqual(getClosed(), ++cCntr);

      checkPromise()
        .then(common.mustCall(closePromiseFd))
        .catch(common.mustNotCall());
    }));
  }));
});

async function checkPromise() {
  const fh = await fs.promises.open(__filename);
  assert.strictEqual(getOpened(), ++oCntr);
  assert.strictEqual(getClosed(), cCntr);
  return fh;
}

async function closePromiseFd(fh) {
  fh = await fh.close();
  assert.strictEqual(fh, undefined);
  assert.strictEqual(getOpened(), oCntr);
  assert.strictEqual(getClosed(), ++cCntr);
}
