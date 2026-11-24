'use strict';

const assert = require('assert');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const common = require('../common.js');

const bench = isMainThread ? common.createBenchmark(main, {
  type: ['span', 'trace'],
  threads: [1, 4],
  n: [1e6],
}, {
  flags: ['--expose-internals', '--no-warnings'],
  test: { n: 100, threads: 4 },
}) : undefined;

function createRun(type) {
  assert(type === 'span' || type === 'trace');
  const binding = common.binding('nsolid_api');
  const output = new Uint8Array(new ArrayBuffer(type === 'span' ? 8 : 16));
  const generate = type === 'span' ?
    () => binding.getSpanId(output) : () => binding.getTraceId(output);
  generate();
  assert(output.some((byte) => byte !== 0));
  return (n) => {
    let checksum = 0;
    for (let i = 0; i < n; i++) {
      generate();
      checksum ^= output[0];
    }
    return checksum;
  };
}

if (!isMainThread) {
  const { n, type, barrier } = workerData;
  const run = createRun(type);
  run(Math.min(n, 1e5));
  parentPort.postMessage('ready');
  Atomics.wait(new Int32Array(barrier), 0, 0);
  parentPort.postMessage(run(n));
}

function main({ n, type, threads }) {
  assert(Number.isInteger(n) && n > 0);
  assert(Number.isInteger(threads) && threads > 0);
  if (threads === 1) {
    const run = createRun(type);
    run(Math.min(n, 1e5));
    bench.start();
    const checksum = run(n);
    bench.end(n);
    assert(Number.isInteger(checksum));
    return;
  }

  const barrier = new SharedArrayBuffer(4);
  let ready = 0;
  let completed = 0;
  let checksum = 0;
  for (let i = 0; i < threads; i++) {
    const worker = new Worker(__filename, { workerData: { n, type, barrier } });
    worker.on('error', (error) => { throw error; });
    worker.on('exit', (code) => assert.strictEqual(code, 0));
    worker.on('message', (message) => {
      if (message === 'ready') {
        if (++ready === threads) {
          bench.start();
          Atomics.store(new Int32Array(barrier), 0, 1);
          Atomics.notify(new Int32Array(barrier), 0, threads);
        }
      } else {
        checksum ^= message;
        if (++completed === threads) {
          bench.end(n * threads);
          assert(Number.isInteger(checksum));
        }
      }
    });
  }
}
