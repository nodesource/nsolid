'use strict';

const { buildType, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const binding = require(bindingPath);
const { Worker, isMainThread } = require('worker_threads');

if (process.env.NSOLID_COMMAND)
  skip('required to run without the Console');

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Test must first run as the main thread');

if (!isMainThread) {
  return;
}

for (let i = 0; i < 10; i++) {
  const worker = new Worker(__filename, { argv: [process.pid] });
  worker.on('exit', (code) => {
    assert.strictEqual(code, 0);
  });
  worker.on('online', () => {
    binding.getMetrics(worker.threadId);
  });
}

binding.getMetrics();
