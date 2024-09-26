'use strict';

const { buildType, mustCall, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const binding = require(bindingPath);
const { Worker, isMainThread, parentPort } = require('worker_threads');
const wkr_count = 10;

if (process.env.NSOLID_COMMAND)
  skip('required to run without the Console');

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Test must first run as the main thread');

if (!isMainThread) {
  const metrics = binding.getProcMetrics();
  assert.ok(typeof metrics === 'string' && JSON.parse(metrics));
  parentPort.on('message', (msg) => {
    assert.strictEqual(msg, 'exit');
    process.exit(0);
  });
  return;
}

process.on('beforeExit', mustCall(() => {
  assert.strictEqual(binding.getCbCntr(), wkr_count);
  assert.strictEqual(binding.getCbCntrGone(), 0);
  assert.strictEqual(binding.getCbCntrLambda(), wkr_count);
}));

const metrics = binding.getProcMetrics();
assert.ok(typeof metrics === 'string' && JSON.parse(metrics));

for (let i = 0; i < wkr_count; i++) {
  const worker = new Worker(__filename, { argv: [process.pid] });
  worker.on('exit', mustCall((code) => {
    assert.strictEqual(code, 0);
  }));
  worker.on('online', mustCall(() => {
    assert.strictEqual(binding.getEnvMetrics(worker.threadId), 0);
    assert.strictEqual(binding.getEnvMetricsLambda(worker.threadId), 0);
    assert.strictEqual(binding.getEnvMetricsGone(worker.threadId), 0);
    worker.postMessage('exit');
  }));
}
