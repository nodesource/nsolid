'use strict';

const { buildType, mustCall, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const binding = require(bindingPath);
const { Worker, isMainThread, parentPort } = require('worker_threads');

if (process.env.NSOLID_COMMAND)
  skip('required to run without the Console');

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Test must first run as the main thread');

if (!isMainThread) {
  parentPort.postMessage('hi');
  if (process.argv[3] === 'spin') {
    const t = 0;
    while (Date.now() - t < 500);
  } else if (process.argv[3] === 'timeout') {
    setTimeout(() => {}, 500);
  }
  return;
}

process.on('beforeExit', mustCall());

createWorker('spin', () => {
  createWorker('timeout');
});

function createWorker(arg, cb) {
  const worker = new Worker(__filename, { argv: [process.pid, arg] });
  worker.once('message', mustCall((msg) => {
    assert.strictEqual(msg, 'hi');
    binding.getSnapshot(worker.threadId);
  }));
  worker.on('exit', mustCall((code) => {
    if (cb)
      setImmediate(cb);
  }));
}
