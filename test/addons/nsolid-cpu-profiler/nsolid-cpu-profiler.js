'use strict';
// Flags: --expose-internals

const { buildType, mustCall, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const binding = require(bindingPath);
const { internalBinding } = require('internal/test/binding');
const { UV_EEXIST, UV_ENOENT } = internalBinding('uv');
const { Worker, isMainThread, threadId, parentPort } =
  require('worker_threads');
let er;

if (process.env.NSOLID_COMMAND)
  skip('required to run without the Console');

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Test must first run as the main thread');

if (!isMainThread) {
  // Starting the profile from this thread.
  er = binding.startCpuProfiler(threadId, 5000);
  assert.strictEqual(er, 0);
  parentPort.postMessage('hi');
  setTimeout(() => {}, 2000);
  return;
}

process.on('beforeExit', mustCall(() => {
  er = binding.stopCpuProfiler(0);
  assert.strictEqual(er, 0);
}));

function checkLastProfile() {
  const str = binding.getLastProfile();
  assert.ok(str.length > 0);
  // Should be valid JSON.
  JSON.parse(str);
}

// Normal usage check.
er = binding.startCpuProfiler(threadId, 10000);
assert.strictEqual(er, 0);
er = binding.stopCpuProfiler(threadId);
assert.strictEqual(er, 0);
setTimeout(() => {
  checkLastProfile();

  // Check error codes for invalid calls.
  er = binding.startCpuProfiler(threadId, 10000);
  assert.strictEqual(er, 0);
  er = binding.startCpuProfiler(threadId, 10);
  assert.strictEqual(er, UV_EEXIST);

  er = binding.stopCpuProfiler(threadId);
  assert.strictEqual(er, 0);
  setTimeout(() => {
    checkLastProfile();
    er = binding.stopCpuProfiler(threadId);
    assert.strictEqual(er, UV_ENOENT);
    // Test getting profile
    er = binding.startCpuProfiler(threadId, 10);
    assert.strictEqual(er, 0);

    setTimeout(() => {
      // The CPU profile should have ended by now.
      er = binding.stopCpuProfiler(threadId);
      assert.strictEqual(er, UV_ENOENT);
      checkLastProfile();
      testWorker();
    }, 500);
  }, 500);
}, 500);

function testWorker() {
  const worker = new Worker(__filename, { argv: [process.pid] });
  worker.on('exit', mustCall((code) => {
    assert.strictEqual(code, 0);
  }));
  worker.once('message', mustCall((msg) => {
    assert.strictEqual(msg, 'hi');

    er = binding.startCpuProfiler(worker.threadId, 500);
    assert.strictEqual(er, UV_EEXIST);

    er = binding.stopCpuProfiler(worker.threadId);
    assert.strictEqual(er, 0);
    setTimeout(() => {
      checkLastProfile();
      er = binding.startCpuProfiler(threadId, 2000);
      assert.strictEqual(er, 0);
    }, 2000);
  }));
}
