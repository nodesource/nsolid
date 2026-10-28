'use strict';

const { isMainThread, parentPort, Worker } = require('worker_threads');
const nsolid = require('nsolid');

const gauge = nsolid.otel.api.metrics.getMeter('idle-observables')
  .createObservableGauge('collections');
let collections = 0;
gauge.addCallback(async (result) => {
  await Promise.resolve();
  result.observe(++collections, { source: isMainThread ? 'main' : 'worker' });
});

// Referenced IPC ports keep both loops alive without JS timers or traffic.
if (isMainThread) {
  const worker = new Worker(__filename);
  worker.once('message', () => process.send('ready'));
  process.once('message', () => {
    worker.terminate().then(() => process.disconnect());
  });
} else {
  parentPort.on('message', () => {});
  parentPort.postMessage('ready');
}
