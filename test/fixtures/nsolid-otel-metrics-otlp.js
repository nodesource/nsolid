'use strict';

const { isMainThread, parentPort, Worker } = require('worker_threads');
const nsolid = require('nsolid');
const api = require('@opentelemetry/api');
const { metrics } = require('@opentelemetry/api-metrics');

nsolid.otel.register({ ...api, metrics }, { traces: false, metrics: true });
const registeredBefore = Date.now();
const meter = metrics.getMeter('custom-otlp', '1.2.3', {
  schemaUrl: 'https://example.com/metrics',
});
const source = isMainThread ? 'main' : 'worker';
const attributes = { source };
const counter = meter.createCounter('requests', {
  unit: '1', description: 'Completed requests',
});
counter.add(2, { source, status: 200, strings: ['ok', 'api'],
                 booleans: [true, false], numbers: [1, 2.5] });
counter.add(3, { numbers: [1, 2.5], booleans: [true, false],
                 strings: ['ok', 'api'], status: 200, source });
counter.add(7, { source, status: 500 });
const shared = meter.createCounter('shared');
shared.add(isMainThread ? 4 : 6);
const upDown = meter.createUpDownCounter('active');
upDown.add(4, attributes);
upDown.add(-1, attributes);
const gauge = meter.createGauge('temperature');
gauge.record(1, attributes);
gauge.record(9, attributes);
const histogram = meter.createHistogram('duration', {
  unit: 'ms', description: 'Request duration',
  advice: { explicitBucketBoundaries: [1, 5] },
});
histogram.record(2, attributes);
histogram.record(4, attributes);
meter.createObservableCounter('observed-total').addCallback((result) => {
  result.observe(11, attributes);
});
meter.createObservableUpDownCounter('observed-active').addCallback((result) => {
  result.observe(-3, attributes);
});
let held;
let release;
let reported = false;
let value = 42;
meter.createObservableGauge('observed-value').addCallback(async (result) => {
  if (held) {
    if (!reported) {
      reported = true;
      process.send({ type: 'pending' });
    }
    await held;
  }
  await Promise.resolve();
  result.observe(value, attributes);
});
const registration = { before: registeredBefore, after: Date.now() };

if (isMainThread) {
  let worker;
  let generation = 0;
  const startWorker = () => {
    const currentGeneration = ++generation;
    worker = new Worker(__filename);
    worker.once('message', (workerRegistration) => process.send({
      type: 'ready', id: nsolid.id, generation: currentGeneration,
      main: registration, worker: workerRegistration,
    }));
    worker.on('exit', (code) => process.send({
      type: 'worker_exit', code, generation: currentGeneration,
    }));
  };
  startWorker();
  process.on('message', ({ type }) => {
    if (type === 'hold') {
      held = new Promise((resolve) => { release = resolve; });
    } else if (type === 'release') {
      value = 84;
      held = undefined;
      release();
    } else if (type === 'finish_worker') {
      worker.postMessage('finish');
    } else if (type === 'restart_worker') {
      startWorker();
    } else if (type === 'finish_main') {
      meter.createCounter('shared').add(1);
      process.disconnect();
    }
  });
} else {
  parentPort.once('message', () => {
    meter.createCounter('shared').add(1);
    parentPort.close();
  });
  parentPort.postMessage(registration);
}
