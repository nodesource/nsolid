'use strict';

const { isMainThread, parentPort, Worker, workerData } = require('worker_threads');
const nsolid = require('nsolid');

const mode = isMainThread ? process.argv[2] : workerData;
const source = isMainThread ? 'main' : 'worker';
const attributes = { source };
const meter = nsolid.otel.api.metrics.getMeter('shutdown-metrics', '1.0');
const counter = meter.createCounter('requests', {
  unit: '1', description: 'Final counter',
});
const upDown = meter.createUpDownCounter('active');
const gauge = meter.createGauge('temperature');
const histogram = meter.createHistogram('duration', { unit: 'ms' });
counter.add(1, attributes);
upDown.add(4, attributes);
gauge.record(1, attributes);
histogram.record(2, attributes);

// Shutdown must not publish these partial observations or wait for settlement.
meter.createObservableGauge('partial').addCallback(async (result) => {
  result.observe(99, attributes);
  const message = { type: 'pending', source };
  if (isMainThread) process.send(message);
  else parentPort.postMessage(message);
  await new Promise(() => {});
});

function finish() {
  counter.add(2, attributes);
  upDown.add(-1, attributes);
  gauge.record(7, attributes);
  histogram.record(4, attributes);
  if (mode === 'disabled') nsolid.otel.api.metrics.disable();
}

if (isMainThread) {
  const worker = new Worker(__filename, { workerData: mode });
  worker.on('message', (message) => process.send(message));
  worker.on('exit', (code) => process.send({ type: 'worker_exit', code }));
  process.on('message', ({ type }) => {
    if (type === 'finish_worker') {
      worker.postMessage('finish');
    } else if (type === 'finish_main') {
      finish();
      if (mode === 'explicit') process.exit(0);
      else process.disconnect();
    }
  });
} else {
  parentPort.once('message', () => {
    finish();
    parentPort.close();
  });
}
