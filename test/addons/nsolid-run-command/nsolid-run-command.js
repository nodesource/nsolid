'use strict';
const common = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const { Worker,
        isMainThread,
        parentPort } = require('worker_threads');

if (!isMainThread) {
  const t = setTimeout(() => {}, 1000000);
  parentPort.on('message', common.mustCall((msg) => {
    assert.strictEqual(msg, 'clearTimeout');
    clearTimeout(t);
    process.exit(0);
  }));
  parentPort.postMessage('ready');
} else {
  const worker = new Worker(__filename);
  worker.on('exit', common.mustCall(() => {
    assert.strictEqual(binding.getInterruptCntr(), 1);
    assert.strictEqual(binding.getInterruptOnlyCntr(), 1);
  }));

  worker.on('message', common.mustCall((msg) => {
    assert.strictEqual(msg, 'ready');
    assert.strictEqual(binding.getInterruptCntr(), 0);
    assert.strictEqual(binding.getInterruptOnlyCntr(), 0);
    setTimeout(() => {
      binding.runInterrupt(worker.threadId);
      binding.runInterruptOnly(worker.threadId);
      setTimeout(() => {
        assert.strictEqual(binding.getInterruptCntr(), 1);
        assert.strictEqual(binding.getInterruptOnlyCntr(), 0);
        worker.postMessage('clearTimeout');
      }, 100);
    }, 100);
  }));
}
