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
  if (process.argv[3]) {
    binding.setAddHooks();
    parentPort.postMessage('hi');
  }
  return;
}

process.on('beforeExit', mustCall(() => {
  assert.strictEqual(binding.getOnThreadAdd(), 6);
  assert.strictEqual(binding.getOnThreadRemove(), 4);
}));

binding.setAddHooks();
const worker = new Worker(__filename, { argv: [process.pid, '1'] });
worker.on('exit', mustCall((code) => {
  assert.strictEqual(code, 0);
}));
worker.on('message', mustCall(() => {
  const w2 = new Worker(__filename, { argv: [process.pid] });
  w2.on('exit', () => {});
}));
