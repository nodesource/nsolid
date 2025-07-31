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
      nsolid.heapProfileStream(arg);
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
      nsolid.heapProfileStream(0, arg);
    },
    {
      message: 'The "duration" argument must be of type number.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

[ 'foo', 5, /a/, Symbol()].forEach((arg) => {
  assert.throws(
    () => {
      nsolid.heapProfileStream(0, 5, arg);
    },
    {
      message: 'The "trackAllocations" argument must be of type boolean.' +
               common.invalidArgTypeHelper(arg),
      code: 'ERR_INVALID_ARG_TYPE'
    }
  );
});

{
  const stream = nsolid.heapProfileStream(10, 12000, true);
  stream.on('error', common.mustCall((err) => {
    assert.strictEqual(err.message, 'Heap profile could not be started');
    assert.strictEqual(err.code, UV_ESRCH);
  }));
}

{
  let profile = '';
  const stream = nsolid.heapProfileStream(0, 1200, true);
  stream.on('data', (data) => {
    profile += data;
  });
  stream.on('end', common.mustCall(() => {
    assert(JSON.parse(profile));
  }));
}
