// Flags: --expose-internals
'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const { internalBinding } = require('internal/test/binding');

const {
  UV_ESRCH,
} = internalBinding('uv');

[ true, 'foo', /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.heapSamplingStream(arg);
    },
    {
      message: 'The "threadId" argument must be of type number.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

[ true, 'foo', /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.heapSamplingStream(0, arg);
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
      nsolid.heapSamplingStream(0, 5, arg);
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
      nsolid.heapSamplingStream(0, 5, opts);
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
      nsolid.heapSamplingStream(0, 5, opts);
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
      nsolid.heapSamplingStream(0, 5, opts);
    },
    {
      message: 'The "options.flags" property must be of type number.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

{
  const stream = nsolid.heapSamplingStream(10, 12000);
  stream.on('error', common.mustCall((err) => {
    assert.strictEqual(err.message, 'Heap sampling could not be started');
    assert.strictEqual(err.code, UV_ESRCH);
  }));
}

{
  // Using a sampleInterval of 0 should result in an error as it causes a crash
  // on v8.
  const opts = { sampleInterval: 0 };
  assert.throws(() => {
    nsolid.heapSamplingStream(0, 12000, opts);
  }, common.expectsError({
    code: 'ERR_OUT_OF_RANGE',
    message: 'The value of "options.sampleInterval" is out of range. It must be >= 1. Received 0',
  }));
}

{
  // Using a duration of 0 should result in an error
  assert.throws(() => {
    nsolid.heapSamplingStream(10, 0);
  }, common.expectsError({
    code: 'ERR_OUT_OF_RANGE',
    message: 'The value of "duration" is out of range. It must be >= 1. Received 0',
  }));
}

{
  let profile = '';
  const stream = nsolid.heapSamplingStream(0, 1200);
  // Do some allocations to make sure we have some data to sample
  const arr = [];
  for (let i = 0; i < 1000; i++) {
    arr.push(new Array(1000));
  }
  stream.on('data', (data) => {
    profile += data;
  });
  stream.on('end', common.mustCall(() => {
    assert(JSON.parse(profile));
    testProfileSchema(JSON.parse(profile));
    runHeapSamplingStreamAssetsToggleTests();
  }));
}

function testProfileSchema(profile) {
  // Basic object schema test
  assert(profile.head);
  assert(profile.samples);

  testCallFrame(profile.head);

  // Recursive schema test per sample callframe
  function testCallFrame(head) {
    assert(Number.isInteger(head.callFrame.columnNumber));
    assert(Number.isInteger(head.callFrame.lineNumber));
    assert(Number.isInteger(head.selfSize));
    assert(Number.isInteger(head.callFrame.scriptId));
    assert(Number.isInteger(head.id));
    assert(head.callFrame.functionName === '' ||
           typeof head.callFrame.functionName === 'string');
    assert(head.callFrame.url === '' || typeof head.callFrame.url === 'string');
    assert(Array.isArray(head.children));
    testChildren(head.children);
  }

  // Recursive children schema test
  function testChildren(children) {
    const isTestDone = children.length === 0;
    if (!isTestDone) return testCallFrame(children[0]);
    assert(isTestDone);
  }
}

function runHeapSamplingStreamAssetsToggleTests() {
  // Disable assets through config update
  nsolid.start({
    command: 'localhost:9001',
    data: 'localhost:9002',
    assetsEnabled: false,
  });

  setImmediate(common.mustCall(() => {
    assert.throws(
      () => {
        nsolid.heapSamplingStream(0, 1000);
      },
      {
        code: 'ERR_NSOLID_HEAP_SAMPLING_START',
        message: 'Heap sampling could not be started'
      }
    );

    // Re-enable via helper and confirm success
    nsolid.enableAssets();
    setImmediate(common.mustCall(() => {
      let profile = '';
      const enabledStream = nsolid.heapSamplingStream(0, 1200);
      enabledStream.on('data', (chunk) => {
        profile += chunk;
      });
      enabledStream.on('end', common.mustCall(() => {
        assert(JSON.parse(profile));
        testProfileSchema(JSON.parse(profile));

        // Disable via helper and confirm failure again
        nsolid.disableAssets();
        setImmediate(common.mustCall(() => {
          assert.throws(
            () => {
              nsolid.heapSamplingStream(0, 1000);
            },
            {
              code: 'ERR_NSOLID_HEAP_SAMPLING_START',
              message: 'Heap sampling could not be started'
            }
          );

          // Re-enable once more to restore functionality
          nsolid.enableAssets();
          setImmediate(common.mustCall(() => {
            const finalStream = nsolid.heapSamplingStream(0, 1200);
            finalStream.resume();
            finalStream.on('end', common.mustCall());
          }));
        }));
      }));
    }));
  }));
}
