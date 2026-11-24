// Flags: --expose-internals
'use strict';

// A worker requests a heap profile of the main thread and exits before the
// profile completes. The profile records retaining the worker's callback are
// released on other threads after the worker isolate has been disposed.

const common = require('../common');
const assert = require('assert');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { internalBinding } = require('internal/test/binding');
const binding = internalBinding('nsolid_api');
const { UV_EEXIST } = internalBinding('uv');

const startArgs = {
  heapProfile: (duration) => [0, duration, true, false],
  heapSampling: (duration) => [0, duration, 512, 16, 0],
};

if (!isMainThread) {
  const { start } = workerData;
  const ret = binding[start](...startArgs[start](60000), common.mustNotCall());
  assert.strictEqual(ret, 0);
  parentPort.postMessage('started');
} else {
  (async () => {
    await run('heapProfile', 'heapProfileEnd');
    await run('heapSampling', 'heapSamplingEnd');
  })().then(common.mustCall());
}

async function run(start, stop) {
  const worker = new Worker(__filename, { workerData: { start } });
  worker.on('error', common.mustNotCall());
  await new Promise((resolve) => worker.once('message', resolve));
  assert.strictEqual(await worker.terminate(), 1);

  // Complete the main thread profile after the requester isolate is gone.
  assert.strictEqual(binding[stop](0), 0);

  // The record is erased once the profile completes. Wait for that by starting
  // a new profile, which also checks the main thread can still be profiled.
  await new Promise((resolve) => {
    const cb = common.mustCallAtLeast((status, data) => {
      assert.strictEqual(status, 0);
      if (data === null)
        resolve();
    });
    function retry() {
      const ret = binding[start](...startArgs[start](1), cb);
      if (ret === UV_EEXIST)
        return setImmediate(retry);
      assert.strictEqual(ret, 0);
    }
    retry();
  });
}
