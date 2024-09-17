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
  parentPort.postMessage('init');
  parentPort.on('message', mustCall((msg) => {
    assert.strictEqual(msg, 'exit');
    parentPort.close();
  }));
  return;
}

process.on('beforeExit', mustCall(() => {
  assert.strictEqual(binding.getCbCntr(), 11);
}));

for (let i = 0; i < 10; i++) {
  const worker = new Worker(__filename, { argv: [process.pid] });
  worker.on('exit', (code) => {
    assert.strictEqual(code, 0);
  });
  worker.on('message', mustCall((msg) => {
    assert.strictEqual(msg, 'init');
    binding.getMetrics(worker.threadId);
    worker.postMessage('exit');
  }));
}

// Let then main thread be a bit idle so we can check that loop_utilization is
// correctly calculdate.
setTimeout(() => {
  binding.getMetrics();
}, 100);
