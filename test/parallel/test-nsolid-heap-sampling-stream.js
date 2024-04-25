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
