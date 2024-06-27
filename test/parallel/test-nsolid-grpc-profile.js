'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

[ true, 'foo', /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.profile(arg);
    },
    {
      message: 'The "timeout" argument must be of type number.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

[ null, false, true, 'foo', 5, /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.profile(5, arg);
    },
    {
      message: 'The "profileCallback" argument must be of type function.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

[ null, false, true, 'foo', 5, /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.profileEnd(arg);
    },
    {
      message: 'The "profileEndCallback" argument must be of type function.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

// profile() should return error if not connected to a console
assert.throws(
  () => {
    nsolid.profile();
  },
  {
    message: 'CPU profile could not be started'
  }
);

nsolid.profile(common.mustCall((err) => {
  assert.notStrictEqual(err.code, 0);
  assert.strictEqual(err.message, 'CPU profile could not be started');
}));

// Configure the console so the `profile()` call may succeed
nsolid.start({
  grpc: 1
});

setTimeout(() => {
  // profile() should return an error if ongoing profile
  assert.strictEqual(nsolid.profile(), undefined);
  assert.throws(
    () => {
      nsolid.profile();
    },
    {
      message: 'CPU profile could not be started'
    }
  );

  nsolid.profile(common.mustCall((err) => {
    assert.notStrictEqual(err.code, 0);
    assert.strictEqual(err.message, 'CPU profile could not be started');
  }));
  assert.strictEqual(nsolid.profileEnd(), undefined);

  setTimeout(() => {
    // profileEnd() should return an error if no ongoing profile
    assert.throws(
      () => {
        nsolid.profileEnd();
      },
      {
        message: 'CPU profile could not be stopped'
      }
    );

    nsolid.profileEnd(common.mustCall((err) => {
      assert.notStrictEqual(err.code, 0);
      assert.strictEqual(err.message, 'CPU profile could not be stopped');
      // The same with callback versions
      // profile() should return an error if ongoing profile
      setTimeout(() => {
        nsolid.profile(common.mustSucceed(() => {
          nsolid.profile(common.mustCall((err) => {
            assert.notStrictEqual(err.code, 0);
            assert.strictEqual(err.message, 'CPU profile could not be started');
            nsolid.profileEnd(common.mustSucceed(() => {
              // profileEnd() should return an error if no ongoing profile
              nsolid.profileEnd(common.mustCall((err) => {
                assert.notStrictEqual(err.code, 0);
                assert.strictEqual(err.message,
                                  'CPU profile could not be stopped');
              }));
            }));
          }));
        }));
      }, 100);
    }));
  }, 100);
}, 100);
