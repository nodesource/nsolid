'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

[ null, false, true, 'foo', 5, /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.snapshot(arg);
    },
    {
      message: 'The "snapshotCallback" argument must be of type function.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

// snapshot() should return error if not connected to a console
assert.throws(
  () => {
    nsolid.snapshot();
  },
  {
    message: 'Heap snapshot could not be generated'
  }
);

nsolid.snapshot(common.mustCall((err) => {
  assert.notStrictEqual(err.code, 0);
  assert.strictEqual(err.message, 'Heap snapshot could not be generated');
}));

// Sonfigure the console so the `snapshot()` call may succeed
nsolid.start({
  command: 'localhost:9001',
  data: 'localhost:9002',
  disableSnapshots: true
});

setImmediate(() => {
  // Snapshot should return an error if snapshots disabled
  assert.throws(
    () => {
      nsolid.snapshot();
    },
    {
      message: 'Heap snapshot could not be generated'
    }
  );

  nsolid.snapshot(common.mustCall((err) => {
    assert.notStrictEqual(err.code, 0);
    assert.strictEqual(err.message, 'Heap snapshot could not be generated');
  }));
});
