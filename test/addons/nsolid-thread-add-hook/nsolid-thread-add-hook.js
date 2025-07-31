'use strict';

const { buildType, mustCall, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const binding = require(bindingPath);
const { Worker, isMainThread } = require('worker_threads');
const wkr_count = 10;

if (process.env.NSOLID_COMMAND)
  skip('required to run without the Console');

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Test must first run as the main thread');

if (!isMainThread) {
  return;
}

process.on('beforeExit', mustCall(() => {
  assert.strictEqual(binding.getThreadAddedCntr(),
                     wkr_count * (wkr_count + 1) / 2);
  assert.strictEqual(binding.getThreadAddedCntr(),
                     binding.getThreadRemovedCntr());
}));

binding.setThreadHooks();

for (let i = 0; i < wkr_count; i++) {
  const worker = new Worker(__filename, { argv: [process.pid] });
  worker.on('exit', mustCall((code) => {
    assert.strictEqual(code, 0);
  }));
  worker.on('online', mustCall());
}
