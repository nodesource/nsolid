'use strict';
// Flags: --expose-internals

const common = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);
const nsolid = require('nsolid');
const { internalBinding } = require('internal/test/binding');
const { UV_EEXIST, UV_EINVAL, UV_ENOENT } = internalBinding('uv');

const circularObj = {
  a: 1,
};

circularObj.b = circularObj;

const customError = new Error('My error');
customError.prop1 = 'my prop1';
customError.prop2 = 'my prop2';

const tests = [
  // Invalid JSON string in args should return UV_EINVAL
  {
    listener: 'custom',
    command: 'custom',
    args: 'hello',
    ret: {
      sent: null,
      expected: null,
    },
    status: UV_EINVAL,
  },
  // Both null and undefined are returned as null
  {
    listener: 'custom',
    command: 'custom',
    args: JSON.stringify('hello'),
    ret: {
      sent: null,
      expected: null,
    },
    status: 0,
  },
  {
    listener: 'custom',
    command: 'custom',
    args: JSON.stringify('hello'),
    ret: {
      sent: undefined,
      expected: null,
    },
    status: 0,
  },
  {
    listener: 'custom',
    command: 'custom',
    args: JSON.stringify({ a: 1, b: 2 }),
    ret: {
      sent: { return: 'value' },
      expected: { return: 'value' },
    },
    status: 0,
  },
  {
    listener: 'custom',
    command: 'custom',
    args: JSON.stringify(''),
    err: {
      sent: null,
      expected: null,
    },
    status: 0,
  },
  {
    listener: 'custom',
    command: 'custom',
    args: JSON.stringify(''),
    err: {
      sent: undefined,
      expected: null,
    },
    status: 0,
  },
  {
    listener: 'custom',
    command: 'custom',
    args: JSON.stringify(''),
    err: {
      sent: { throw: 'error' },
      expected: { throw: 'error' },
    },
    status: 0,
  },
  // If no listener installed, sending the command should return UV_ENOENT
  {
    listener: 'custom',
    command: 'custom1',
    args: JSON.stringify({ a: 1, b: 2 }),
    status: UV_ENOENT,
  },
  // When trying to return the same command multiple times, it should throw an
  // exception
  {
    listener: 'custom',
    command: 'custom',
    args: JSON.stringify(''),
    ret: {
      sent: { return: 'value' },
      expected: { return: 'value' },
    },
    err: {
      sent: { throw: 'error' },
      expected: { return: 'value' },
    },
    status: 0,
  },
  // It should work also with circular objects
  {
    listener: 'custom',
    command: 'custom',
    args: JSON.stringify({ a: 1, b: 2 }),
    ret: {
      sent: circularObj,
      expected: { a: 1, b: '[Circular]' },
    },
    status: 0,
  },
  // And also with errors
  {
    listener: 'custom',
    command: 'custom',
    args: JSON.stringify({ a: 1, b: 2 }),
    ret: {
      sent: customError,
    },
    status: 0,
  },
  {
    listener: 'custom',
    command: 'custom',
    args: JSON.stringify({ a: 1, b: 2 }),
    err: {
      sent: customError,
    },
    status: 0,
  },
];

let counter = 0;

function runTest({ args, listener, command, ret, err, status }, done) {
  nsolid.on(listener, (request) => {
    if (ret) {
      request.return(ret.sent);
      if (err) {
        assert.throws(
          () => {
            request.throw(err.sent);
          },
          {
            message: `custom command \`${listener}\` (${requestId}) \
already returned`,
            code: 'ERR_NSOLID_CUSTOM_COMMAND_ALREADY_RETURNED',
          },
        );
      }
    } else if (err) {
      request.throw(err.sent);
    }
  });

  const requestId = `${nsolid.id}${++counter}`;
  assert.strictEqual(binding.customCommand(
    requestId,
    command,
    args,
    (reqId, cmd, st, error, value) => {
      assert.strictEqual(cmd, command);
      assert.strictEqual(requestId, reqId);
      assert.strictEqual(st, status);
      if (st < 0) {
        return done();
      }

      if (ret) {
        assert.ifError(error);
        if (ret.sent === customError) {
          const receivedErr = JSON.parse(value);
          assert.strictEqual(customError.message, receivedErr.message);
          assert.strictEqual(customError.prop1, receivedErr.prop1);
          assert.strictEqual(customError.prop2, receivedErr.prop2);
          assert.ok(receivedErr.stack);
        } else {
          assert.strictEqual(JSON.stringify(ret.expected), value);
        }

        return done();
      }

      if (err) {
        assert.ifError(value);
        if (err.sent === customError) {
          const receivedErr = JSON.parse(error);
          assert.strictEqual(customError.message, receivedErr.message);
          assert.strictEqual(customError.prop1, receivedErr.prop1);
          assert.strictEqual(customError.prop2, receivedErr.prop2);
          assert.ok(receivedErr.stack);
        } else {
          assert.strictEqual(JSON.stringify(err.expected), error);
        }

        return done();
      }

      assert.ok(false);
    },
  ), 0);

  assert.strictEqual(binding.customCommand(requestId,
                                           command,
                                           args,
                                           common.mustNotCall()),
                     UV_EEXIST);
}

setTimeout(() => {
  let index = 0;
  function doRun() {
    if (index < tests.length) {
      runTest(tests[index++], doRun);
      return;
    }

    assert.strictEqual(index, tests.length);
    clearInterval(interval);
  }

  doRun();
}, 100);

// To keep the process alive.
const interval = setInterval(() => {}, 1000);
