'use strict';
// Flags: --expose-gc --expose-internals

const common = require('../../common');
const assert = require('assert');
const {
  Worker,
  isMainThread,
  threadId,
  parentPort,
} = require('worker_threads');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const {
  customCommandThread,
  setCustomCommandCb,
} = require(bindingPath);
const nsolid = require('nsolid');
const { internalBinding } = require('internal/test/binding');
const { UV_ESRCH } = internalBinding('uv');

if (process.env.NSOLID_COMMAND)
  common.skip('required to run without the Console');

if (!isMainThread && +process.argv[2] !== process.pid)
  common.skip('Test must first run as the main thread');

nsolid.on('custom', common.mustCall((request) => {
  request.return('goodbye');
}));

if (!isMainThread) {
  // This is a Worker thread, so we exit early.
  let exit = false;
  const interval = setInterval(() => {
    if (exit) {
      // For gc on worker so EnvInst::CustomCommandReqWeakCallback is called.
      global.gc();
      clearInterval(interval);
    }
  }, 300);

  const reqId = process.argv[3];
  console.log('reqId:', reqId);
  setCustomCommandCb(reqId, common.mustCall((id, cmd, st, error, value) => {
    assert.strictEqual(id, reqId);
    assert.strictEqual(cmd, 'custom');
    assert.strictEqual(st, 0);
    assert.strictEqual(error, null);
    assert.strictEqual(value, '"goodbye"');
    exit = true;
  }));

  parentPort.postMessage('ready');
  return;
}

let counter = 0;

const req1 = `${nsolid.id}${++counter}`;
{
  // Sending a custom command to a non-existent thread should return UV_ESRCH
  const ret = customCommandThread(threadId + 1,
                                  req1,
                                  'custom',
                                  JSON.stringify('hello'));
  assert.strictEqual(ret, UV_ESRCH);
}
{
  // Sending a custom command with the same request id should succeed as the
  // previous did fail.
  setCustomCommandCb(req1, common.mustCall((id, cmd, st, error, value) => {
    assert.strictEqual(id, req1);
    assert.strictEqual(cmd, 'custom');
    assert.strictEqual(st, 0);
    assert.strictEqual(error, null);
    assert.strictEqual(value, '"goodbye"');
  }));

  const ret = customCommandThread(threadId,
                                  req1,
                                  'custom',
                                  JSON.stringify('hello'));

  assert.strictEqual(ret, 0);
}

// It also works with Worker threads.
const req2 = `${nsolid.id}${++counter}`;
const worker = new Worker(__filename, { argv: [process.pid, req2] });
worker.on('message', common.mustCall((msg) => {
  assert.strictEqual(msg, 'ready');
  const ret = customCommandThread(worker.threadId,
                                  req2,
                                  'custom',
                                  JSON.stringify('hello'));
  assert.strictEqual(ret, 0);
}));

worker.on('exit', common.mustCall((code) => {
  assert.strictEqual(code, 0);
  clearInterval(interval);
}));

// To keep the process alive.
const interval = setInterval(() => {
}, 300);
