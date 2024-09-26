'use strict';
const common = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const { Worker, isMainThread } = require('worker_threads');

if (!isMainThread) {
  binding.queueCallback();
  setTimeout(() => {}, 200);
  return;
}

binding.queueCallback();
setTimeout(() => {}, 200);

for (let i = 0; i < 5; i++) {
  const worker = new Worker(__filename);
  worker.on('exit', (code) => {
    assert.strictEqual(code, 0);
  });
}
