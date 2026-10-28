// Flags: --expose-internals
'use strict';

const common = require('../common');
const assert = require('node:assert');
const { mock } = require('node:test');
const { internalBinding } = require('internal/test/binding');
const nsolid = require('nsolid');

common.expectWarning('internal/test/binding',
                     'These APIs are for internal testing only. Do not use them.');
common.expectWarning('Warning', 'OpenTelemetry metric callback timed out.',
                     'NSOLID_OTEL_METRIC_TIMEOUT');

// Capture mocked timers when the lazy metrics implementation is loaded.
mock.timers.enable({ apis: [ 'setTimeout' ] });
const metrics = nsolid.otel.api.metrics;
const meter = metrics.getMeter('callback-timeouts');
const counter = meter.createCounter('requests');
const single = meter.createObservableGauge('single');
const batch = meter.createObservableGauge('batch');
const healthy = meter.createObservableGauge('healthy');
const { Metrics } = internalBinding('metrics');
const binding = new Metrics();
const add = mock.method(Metrics.prototype, 'add');
const collectionDone = Metrics.prototype.collectionDone;
let onComplete;
let completions = 0;
mock.method(Metrics.prototype, 'collectionDone', function() {
  collectionDone.call(this);
  completions++;
  onComplete();
});

function collect() {
  const completed = new Promise((resolve) => { onComplete = resolve; });
  binding.collect();
  return completed;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

const checkpoint = () => new Promise((resolve) => setImmediate(resolve));
const values = () => add.mock.calls.map((call) => call.arguments[1]);
let singleGate = deferred();
let batchGate = deferred();
let singleResult;
let batchResult;
let runs = 0;
single.addCallback(async (result) => {
  runs++;
  singleResult = result;
  const gate = singleGate;
  const attributes = { stage: 'before' };
  result.observe(1, attributes);
  attributes.stage = 'mutated';
  await gate.promise;
  result.observe(2, { stage: 'after' });
});
meter.addBatchObservableCallback(async (result) => {
  batchResult = result;
  const gate = batchGate;
  result.observe(batch, 3);
  await gate.promise;
  result.observe(batch, 4);
}, [ batch ]);
healthy.addCallback((result) => result.observe(5));
single.addCallback((result) => {
  result.observe(90);
  throw new Error('Synchronous failure');
});
single.addCallback(async (result) => {
  result.observe(91);
  await Promise.resolve();
  throw new Error('Asynchronous failure');
});
meter.addBatchObservableCallback(async (result) => {
  result.observe(batch, 92);
  throw new Error('Batch failure');
}, [ batch ]);

(async () => {
  const successful = collect();
  assert.deepStrictEqual(values(), []);
  await checkpoint();
  assert.deepStrictEqual(values(), [ 5 ]);
  singleGate.resolve();
  await checkpoint();
  assert.deepStrictEqual(values(), [ 5, 1, 2 ]);
  assert.strictEqual(completions, 0);
  assert.deepStrictEqual(JSON.parse(add.mock.calls[1].arguments[2]),
                         { stage: 'before' });
  batchGate.resolve();
  await successful;
  assert.deepStrictEqual(values(), [ 5, 1, 2, 3, 4 ]);
  assert.strictEqual(completions, 1);
  singleResult.observe(99);
  batchResult.observe(batch, 99);
  assert.deepStrictEqual(values(), [ 5, 1, 2, 3, 4 ]);

  add.mock.resetCalls();
  singleGate = deferred();
  batchGate = deferred();
  const timedOutSingleGate = singleGate;
  const timedOutBatchGate = batchGate;
  const timedOut = collect();
  const timedOutSingleResult = singleResult;
  const timedOutBatchResult = batchResult;
  await checkpoint();
  counter.add(7);
  mock.timers.tick(29999);
  await checkpoint();
  assert.strictEqual(completions, 1);
  binding.collect();
  assert.strictEqual(runs, 2);
  mock.timers.tick(1);
  await timedOut;
  assert.strictEqual(completions, 2);
  assert.deepStrictEqual(values(), [ 5, 7 ]);

  add.mock.resetCalls();
  singleGate = deferred();
  batchGate = deferred();
  const recovered = collect();
  assert.strictEqual(runs, 3);
  timedOutSingleResult.observe(98);
  timedOutBatchResult.observe(batch, 98);
  timedOutSingleGate.resolve();
  timedOutBatchGate.reject(new Error('Late rejection'));
  await checkpoint();
  assert.strictEqual(completions, 2);
  assert.deepStrictEqual(values(), [ 5 ]);
  singleGate.resolve();
  batchGate.resolve();
  await recovered;
  assert.strictEqual(completions, 3);
  assert.deepStrictEqual(values(), [ 5, 1, 2, 3, 4 ]);

  add.mock.resetCalls();
  singleGate = deferred();
  batchGate = deferred();
  const disabled = collect();
  metrics.disable();
  await disabled;
  assert.strictEqual(completions, 4);
  singleGate.resolve();
  batchGate.resolve();
  singleResult.observe(97);
  batchResult.observe(batch, 97);
  await checkpoint();
  assert.deepStrictEqual(values(), []);
  mock.timers.tick(30000);
  await checkpoint();
  assert.strictEqual(completions, 4);
})().finally(() => {
  mock.restoreAll();
  mock.timers.reset();
}).catch((error) => {
  setImmediate(() => { throw error; });
});
