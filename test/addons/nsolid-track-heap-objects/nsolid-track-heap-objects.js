'use strict';
// Flags: --expose-internals

const { buildType, mustCall, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const binding = require(bindingPath);
const { Worker, isMainThread, parentPort, threadId } = require('worker_threads');
const { internalBinding } = require('internal/test/binding');
const { UV_EEXIST, UV_ENOENT } = internalBinding('uv');

let er;

if (process.env.NSOLID_COMMAND)
  skip('required to run without the Console');

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Test must first run as the main thread');

if (!isMainThread) {
  // Starting the profile from this thread.
  er = binding.startTrackingHeapObjects(threadId, false, false, 5000);
  assert.strictEqual(er, 0);
  parentPort.postMessage('hi');
  setTimeout(() => {}, 2000);
  return;
}

const keepAlive = setInterval(() => {}, 1000);

process.on('beforeExit', mustCall(() => {
  er = binding.stopTrackingHeapObjects(0);
  // It could be peding or not.
  assert.ok(er === 0 || er === UV_ENOENT);
}));

// Normal usage check.
er = binding.startTrackingHeapObjects(threadId, false, false, 10000, mustCall((status, profile) => {
  assert.strictEqual(status, 0);
  assert(JSON.parse(profile));

  // // Check error codes for invalid calls.
  er = binding.startTrackingHeapObjects(threadId, false, false, 10000, mustCall((status, profile) => {
    assert.strictEqual(status, 0);
    assert(JSON.parse(profile));

    er = binding.stopTrackingHeapObjects(threadId);
    assert.strictEqual(er, UV_ENOENT);
    // Test getting profile
    er = binding.startTrackingHeapObjects(threadId, false, false, 10, mustCall((status, profile) => {
      assert.strictEqual(status, 0);
      assert(JSON.parse(profile));

      er = binding.stopTrackingHeapObjects(threadId);
      assert.strictEqual(er, UV_ENOENT);
      testWorker();
      clearInterval(keepAlive);
    }));
    assert.strictEqual(er, 0);
  }));

  assert.strictEqual(er, 0);
  er = binding.startTrackingHeapObjects(threadId, false, false, 10);
  assert.strictEqual(er, UV_EEXIST);
  er = binding.stopTrackingHeapObjectsSync(threadId);
  assert.strictEqual(er, 0);
}));

assert.strictEqual(er, 0);
er = binding.stopTrackingHeapObjects(threadId);
assert.strictEqual(er, 0);

function testWorker() {
  const worker = new Worker(__filename, { argv: [process.pid] });
  worker.on('exit', mustCall((code) => {
    assert.strictEqual(code, 0);
  }));
  worker.once('message', mustCall((msg) => {
    assert.strictEqual(msg, 'hi');

    er = binding.startTrackingHeapObjects(worker.threadId, false, false, 500);
    assert.strictEqual(er, UV_EEXIST);

    er = binding.stopTrackingHeapObjects(worker.threadId);
    assert.strictEqual(er, 0);
    setTimeout(() => {
      er = binding.startTrackingHeapObjects(threadId, false, false, 2000);
      assert.strictEqual(er, 0);
    }, 2000);
  }));
}
