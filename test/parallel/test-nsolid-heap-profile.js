'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

[ true, 'foo', /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.heapProfile(arg);
    },
    {
      message: 'The "timeout" argument must be of type number.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

[ 'foo', 5, /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.heapProfile(5, arg);
    },
    {
      message: 'The "trackAllocations" argument must be of type boolean.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

[ null, false, true, 'foo', 5, /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.heapProfile(5, true, arg);
    },
    {
      message: 'The "heapProfileCallback" argument must be of type function.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

[ null, false, true, 'foo', 5, /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.heapProfileEnd(arg);
    },
    {
      message: 'The "heapProfileEndCallback" argument must be of type function.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

// profile() should return error if not connected to a console
assert.throws(
  () => {
    nsolid.heapProfile();
  },
  {
    message: 'Heap profile could not be started'
  }
);

nsolid.heapProfile(common.mustCall((err) => {
  assert.notStrictEqual(err.code, 0);
  assert.strictEqual(err.message, 'Heap profile could not be started');
}));

// Configure the console so the `profile()` call may succeed
nsolid.start({
  command: 'localhost:9001',
  data: 'localhost:9002'
});

setTimeout(() => {
  // profile() should return an error if ongoing profile
  assert.strictEqual(nsolid.heapProfile(), undefined);
  assert.throws(
    () => {
      nsolid.heapProfile();
    },
    {
      message: 'Heap profile could not be started'
    }
  );

  nsolid.heapProfile(common.mustCall((err) => {
    assert.notStrictEqual(err.code, 0);
    assert.strictEqual(err.message, 'Heap profile could not be started');
  }));
  assert.strictEqual(nsolid.heapProfileEnd(), undefined);

  setTimeout(() => {
    // profileEnd() should return an error if no ongoing profile
    assert.throws(
      () => {
        nsolid.heapProfileEnd();
      },
      {
        message: 'Heap profile could not be stopped'
      }
    );

    nsolid.heapProfileEnd(common.mustCall((err) => {
      assert.notStrictEqual(err.code, 0);
      assert.strictEqual(err.message, 'Heap profile could not be stopped');
      // The same with callback versions
      // profile() should return an error if ongoing profile
      nsolid.heapProfile(common.mustSucceed(() => {
        nsolid.heapProfile(common.mustCall((err) => {
          assert.notStrictEqual(err.code, 0);
          assert.strictEqual(err.message, 'Heap profile could not be started');
          nsolid.heapProfileEnd(common.mustSucceed(() => {
            // profileEnd() should return an error if no ongoing profile
            nsolid.heapProfileEnd(common.mustCall((err) => {
              assert.notStrictEqual(err.code, 0);
              assert.strictEqual(err.message,
                                 'Heap profile could not be stopped');
            }));
          }));
        }));
      }));
    }));
  }, 100);
}, 100);
