'use strict';

const common = require('../common');
if (process.platform !== 'linux')
  common.skip('eBPF profiling requires Linux');

const assert = require('assert');
const fs = require('fs');
const { once } = require('events');
const { Worker, isMainThread } = require('worker_threads');
if (!isMainThread)
  common.skip('Profiling configuration requires the main thread');
const nsolid = require('nsolid');

function perfEventCount() {
  return fs.readdirSync('/proc/self/fd').filter((fd) => {
    try {
      return fs.readlinkSync(`/proc/self/fd/${fd}`).includes('perf_event');
    } catch (err) {
      // The directory read can include descriptors closed before readlink.
      if (err.code === 'ENOENT')
        return false;
      throw err;
    }
  }).length;
}

async function createWorker() {
  const worker = new Worker(`
    const { parentPort } = require('worker_threads');
    parentPort.once('message', () => parentPort.close());
    parentPort.postMessage('ready');
  `, { eval: true });
  assert.deepStrictEqual(await once(worker, 'message'), ['ready']);
  return worker;
}

async function stopWorker(worker) {
  const exited = once(worker, 'exit');
  worker.postMessage('stop');
  assert.deepStrictEqual(await exited, [0]);
}

nsolid.start({ ebpfProfiling: false });
const baseline = perfEventCount();
nsolid.start({ ebpfProfiling: true });
if (nsolid.config.ebpfProfiling !== 1)
  common.skip('eBPF profiling is unsupported or unavailable');
assert.strictEqual(perfEventCount(), baseline + 1);

async function test() {
  // Workers created after enable must attach, then detach on exit.
  for (let i = 0; i < 2; ++i) {
    const worker = await createWorker();
    assert.strictEqual(perfEventCount(), baseline + 2);
    await stopWorker(worker);
    assert.strictEqual(perfEventCount(), baseline + 1);
  }

  // A worker created while disabled must attach through the enable snapshot.
  nsolid.start({ ebpfProfiling: false });
  const worker = await createWorker();
  assert.strictEqual(perfEventCount(), baseline);
  nsolid.start({ ebpfProfiling: true });
  assert.strictEqual(perfEventCount(), baseline + 2);
  nsolid.start({ ebpfProfiling: false });
  assert.strictEqual(perfEventCount(), baseline);
  await stopWorker(worker);
  assert.strictEqual(perfEventCount(), baseline);

  // Enable can race with registration; either path must attach exactly once.
  const starting = createWorker();
  nsolid.start({ ebpfProfiling: true });
  const racingWorker = await starting;
  assert.strictEqual(perfEventCount(), baseline + 2);
  nsolid.start({ ebpfProfiling: false });

  // An enable snapshot racing with exit must not leave the worker attached.
  const stopping = stopWorker(racingWorker);
  nsolid.start({ ebpfProfiling: true });
  await stopping;
  assert.strictEqual(perfEventCount(), baseline + 1);
  nsolid.start({ ebpfProfiling: false });
  assert.strictEqual(perfEventCount(), baseline);
}

test().then(common.mustCall());
