'use strict';
const common = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);
const { Worker, isMainThread } = require('worker_threads');

if (!isMainThread) {
  setTimeout(() => {}, 1000);
  return;
}

for (let i = 0; i < 10; i++) {
  const worker = new Worker(__filename);
  worker.on('online', () => {
    binding.runEventLoop(worker.threadId);
  });
  worker.on('exit', (code) => {
    assert.strictEqual(code, 0);
  });
}
