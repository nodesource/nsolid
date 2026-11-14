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

// Configure the console so the `snapshot()` call may succeed
nsolid.start({
  command: 'localhost:9001',
  data: 'localhost:9002',
  assetsEnabled: false,
});

setImmediate(common.mustCall(() => {
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

    nsolid.enableAssets();
    assert.strictEqual(nsolid.assetsEnabled, true);
    nsolid.disableAssets();
    assert.throws(
      () => nsolid.snapshot(),
      { message: 'Heap snapshot could not be generated' }
    );

    nsolid.enableAssets();
    nsolid.snapshot(common.mustSucceed(runDisableSnapshotsTests));
  }));
}));

// Disabling snapshots can't be undone, so it is tested last.
function runDisableSnapshotsTests() {
  nsolid.start({
    command: 'localhost:9001',
    data: 'localhost:9002',
    disableSnapshots: true,
  });

  setImmediate(common.mustCall(() => {
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

      // Once set, disableSnapshots cannot be reset.
      nsolid.start({
        command: 'localhost:9001',
        data: 'localhost:9002',
        disableSnapshots: false,
      });
      assert.strictEqual(nsolid.config.disableSnapshots, true);
      setImmediate(common.mustCall(() => {
        nsolid.snapshot(common.mustCall((err) => {
          assert.notStrictEqual(err.code, 0);
          assert.strictEqual(err.message,
                             'Heap snapshot could not be generated');
        }));
      }));
    }));
  }));
}
