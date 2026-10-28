'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

[ true, 'foo', /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.heapSampling(arg);
    },
    {
      message: 'The "duration" argument must be of type number.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

[ 'foo', 5, true, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.heapSampling(5, arg);
    },
    {
      message: 'The "options" argument must be of type object.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

[ true, 'foo', /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      const opts = { sampleInterval: arg };
      nsolid.heapSampling(5, opts);
    },
    {
      message: 'The "options.sampleInterval" property must be of type number.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

[ true, 'foo', /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      const opts = { stackDepth: arg };
      nsolid.heapSampling(5, opts);
    },
    {
      message: 'The "options.stackDepth" property must be of type number.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

[ true, 'foo', /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      const opts = { flags: arg };
      nsolid.heapSampling(5, opts);
    },
    {
      message: 'The "options.flags" property must be of type number.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

[ null, false, true, 'foo', 5, /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.heapSampling(5, {}, arg);
    },
    {
      message: 'The "heapSamplingCallback" argument must be of type function.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

[ null, false, true, 'foo', 5, /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.heapSamplingEnd(arg);
    },
    {
      message: 'The "heapSamplingEndCallback" argument must be of type function.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

// profile() should return error if not connected to a console
assert.throws(
  () => {
    nsolid.heapSampling();
  },
  {
    message: 'Heap sampling could not be started'
  }
);

nsolid.heapSampling(common.mustCall((err) => {
  assert.notStrictEqual(err.code, 0);
  assert.strictEqual(err.message, 'Heap sampling could not be started');
}));

// Configure the console so the `profile()` call may succeed
nsolid.start({
  command: 'localhost:9001',
  data: 'localhost:9002'
});

setTimeout(common.mustCall(() => {
  // profile() should return an error if ongoing profile
  assert.strictEqual(nsolid.heapSampling(), undefined);
  assert.throws(
    () => {
      nsolid.heapSampling();
    },
    {
      message: 'Heap sampling could not be started'
    }
  );

  nsolid.heapSampling(common.mustCall((err) => {
    assert.notStrictEqual(err.code, 0);
    assert.strictEqual(err.message, 'Heap sampling could not be started');
  }));
  assert.strictEqual(nsolid.heapSamplingEnd(), undefined);

  setTimeout(common.mustCall(() => {
    // profileEnd() should return an error if no ongoing profile
    assert.throws(
      () => {
        nsolid.heapSamplingEnd();
      },
      {
        message: 'Heap sampling could not be stopped'
      }
    );

    nsolid.heapSamplingEnd(common.mustCall((err) => {
      assert.notStrictEqual(err.code, 0);
      assert.strictEqual(err.message, 'Heap sampling could not be stopped');
      // The same with callback versions
      // profile() should return an error if ongoing profile
      nsolid.heapSampling(common.mustSucceed(() => {
        nsolid.heapSampling(common.mustCall((err) => {
          assert.notStrictEqual(err.code, 0);
          assert.strictEqual(err.message, 'Heap sampling could not be started');
          nsolid.heapSamplingEnd(common.mustSucceed(() => {
            // profileEnd() should return an error if no ongoing profile
            nsolid.heapSamplingEnd(common.mustCall((err) => {
              assert.notStrictEqual(err.code, 0);
              assert.strictEqual(
                err.message,
                'Heap sampling could not be stopped'
              );
              runHeapSamplingAssetsToggleTests();
            }));
          }));
        }));
      }));
    }));
  }), common.platformTimeout(100));
}), common.platformTimeout(100));

function runHeapSamplingAssetsToggleTests() {
  // Disable assets through config update
  nsolid.start({
    command: 'localhost:9001',
    data: 'localhost:9002',
    assetsEnabled: false,
  });

  setTimeout(common.mustCall(() => {
    assert.throws(
      () => {
        nsolid.heapSampling();
      },
      {
        message: 'Heap sampling could not be started'
      }
    );

    nsolid.heapSampling(common.mustCall((err) => {
      assert.notStrictEqual(err.code, 0);
      assert.strictEqual(err.message, 'Heap sampling could not be started');
    }));

    assert.throws(
      () => {
        nsolid.heapSamplingEnd();
      },
      {
        message: 'Heap sampling could not be stopped'
      }
    );

    // Re-enable via helper
    nsolid.enableAssets();
    setTimeout(common.mustCall(() => {
      // Start sampling and wait for it to complete before toggling assets
      nsolid.heapSampling(common.mustSucceed(() => {
        nsolid.heapSamplingEnd(common.mustSucceed(() => {
          // Only disable assets after sampling completes
          nsolid.disableAssets();
          setTimeout(common.mustCall(() => {
            assert.throws(
              () => {
                nsolid.heapSampling();
              },
              {
                message: 'Heap sampling could not be started'
              }
            );

            assert.throws(
              () => {
                nsolid.heapSamplingEnd();
              },
              {
                message: 'Heap sampling could not be stopped'
              }
            );

            // Only re-enable after errors are confirmed
            nsolid.enableAssets();
            setTimeout(common.mustCall(() => {
              nsolid.heapSampling(common.mustSucceed(() => {
                nsolid.heapSamplingEnd(common.mustSucceed());
              }));
            }), common.platformTimeout(100));
          }), common.platformTimeout(100));
        }));
      }));
    }), common.platformTimeout(100));
  }), common.platformTimeout(100));
}
