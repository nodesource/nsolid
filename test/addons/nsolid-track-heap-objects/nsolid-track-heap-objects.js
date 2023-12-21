'use strict';
// Flags: --expose-internals

const { buildType, mustCall, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const binding = require(bindingPath);
const { Worker, isMainThread, parentPort } = require('worker_threads');
const { internalBinding } = require('internal/test/binding');
const { UV_EEXIST, UV_ENOENT } = internalBinding('uv');

if (process.env.NSOLID_COMMAND)
  skip('required to run without the Console');

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Test must first run as the main thread');

if (!isMainThread) {
  parentPort.postMessage('hi');
  if (process.argv[3] === 'spin') {
    const t = 0;
    while (Date.now() - t < 500);
  } else if (process.argv[3] === 'timeout') {
    setTimeout(() => {}, 500);
  }
} else {
  let err = binding.startTrackingHeapObjects(0, false, false, 4000);
  assert.strictEqual(err, 0);
  // Should not stack
  err = binding.startTrackingHeapObjects(0, false, false, 4000);
  assert.strictEqual(err, UV_EEXIST);
  // Should early stop as well
  err = binding.stopTrackingHeapObjects(0);
  assert.strictEqual(err, 0);

  createWorker('spin', () => {
    createWorker('timeout');
  });
}

process.on('beforeExit', mustCall());

function createWorker(arg, cb) {
  const worker = new Worker(__filename, { argv: [process.pid, arg] });
  worker.once('message', mustCall((msg) => {
    assert.strictEqual(msg, 'hi');
    // Can not stop a non-existen profiler in course
    let err = binding.stopTrackingHeapObjects(worker.threadId);
    assert.strictEqual(err, UV_ENOENT);
    // Signature: threadId, redacted, trackAllocations, duration
    err = binding.startTrackingHeapObjects(worker.threadId, false, false, 0);
    assert.strictEqual(err, 0);
    err = binding.stopTrackingHeapObjects(worker.threadId);
    assert.strictEqual(err, 0);

  }));
  worker.on('exit', mustCall(() => {
    if (cb)
      setImmediate(cb);
  }));
}
