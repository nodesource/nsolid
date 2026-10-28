'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

common.expectWarning('Warning',
                     'Invalid OpenTelemetry metric input was ignored.',
                     'NSOLID_OTEL_INVALID_METRIC');

const metrics = nsolid.otel.api.metrics;
const meter = metrics.getMeter('api-contract', '1.0', {
  schemaUrl: 'https://example.com/schema',
});

assert.strictEqual(metrics.getMeter('api-contract', '1.0', {
  schemaUrl: 'https://example.com/schema',
}), meter);
assert.notStrictEqual(metrics.getMeter('api-contract', '2.0', {
  schemaUrl: 'https://example.com/schema',
}), meter);
assert.notStrictEqual(metrics.getMeter('api-contract', '1.0', {
  schemaUrl: 'https://example.com/other-schema',
}), meter);
assert.notStrictEqual(metrics.getMeter('other-api-contract', '1.0', {
  schemaUrl: 'https://example.com/schema',
}), meter);

const counter = meter.createCounter('requests', {
  unit: 'By',
  description: 'Bytes sent',
});
assert.strictEqual(meter.createCounter('requests', {
  unit: 's',
  description: 'ignored after first creation',
}), counter);
counter.add(1);

const histogram = meter.createHistogram('latency', {
  advice: { explicitBucketBoundaries: [ 1, 5 ] },
  valueType: 0,
});
assert.strictEqual(meter.createHistogram('latency', {
  advice: { explicitBucketBoundaries: [ 2, 4 ] },
}), histogram);
histogram.record(3);

// valueType and advice on non-histogram instruments are accepted but ignored.
meter.createCounter('integer-counter', { valueType: 0 }).add(1);
meter.createCounter('counter-with-histogram-advice', {
  advice: { explicitBucketBoundaries: [ 1 ] },
}).add(1);

for (const boundaries of [
  [ 2, 1 ],
  [ 1, 1 ],
  [ NaN ],
  [ Infinity ],
  [ '1' ],
]) {
  // Invalid advice falls back to default boundaries without throwing.
  meter.createHistogram(`invalid-${String(boundaries)}`, {
    advice: { explicitBucketBoundaries: boundaries },
  }).record(1);
}

// Invalid metadata still produces usable instruments.
metrics.getMeter(null, 42, { schemaUrl: false })
  .createCounter(null, { unit: {}, description: 42 }).add(1);
meter.createHistogram('unserializable-advice', {
  advice: { explicitBucketBoundaries: [ 1n ] },
}).record(1);

const observable = meter.createObservableGauge('deduplicated-callback');
assert.throws(() => observable.addCallback(null), {
  name: 'TypeError',
  code: 'ERR_INVALID_ARG_TYPE',
});
let individualCalls = 0;
const individualCallback = () => individualCalls++;
observable.addCallback(individualCallback);
observable.addCallback(individualCallback);

const first = meter.createObservableGauge('batch-first');
const second = meter.createObservableGauge('batch-second');
const undeclared = meter.createObservableGauge('batch-undeclared');
const otherMeter = metrics.getMeter('other-meter');
const foreign = otherMeter.createObservableGauge('batch-foreign');
let batchCalls = 0;
const batchCallback = (result) => {
  batchCalls++;
  result.observe(first, 1);
  result.observe(second, 2);
  result.observe(undeclared, 3);
  result.observe({}, 5);
};

const firstSet = [ first, second, first ];
const reorderedFirstSet = [ second, first ];
const secondSet = [ second, undeclared ];
assert.throws(() => meter.addBatchObservableCallback(() => {}, [ {} ]),
              { name: 'TypeError', code: 'ERR_INVALID_ARG_VALUE' });
assert.throws(() => meter.addBatchObservableCallback(() => {}, [ foreign ]),
              { name: 'TypeError', code: 'ERR_INVALID_ARG_VALUE' });
meter.addBatchObservableCallback(batchCallback, firstSet);
meter.addBatchObservableCallback(batchCallback, reorderedFirstSet);
meter.addBatchObservableCallback(batchCallback, secondSet);
let remainingBatchCalls = 0;
const removalCallback = () => remainingBatchCalls++;
meter.addBatchObservableCallback(removalCallback, firstSet);
meter.addBatchObservableCallback(removalCallback, reorderedFirstSet);
meter.addBatchObservableCallback(removalCallback, secondSet);
meter.removeBatchObservableCallback(removalCallback, reorderedFirstSet);
let duplicateInstrumentCalls = 0;
const duplicateInstrument = meter.createObservableGauge('batch-duplicate');
meter.addBatchObservableCallback(() => duplicateInstrumentCalls++,
                                 [ duplicateInstrument, duplicateInstrument ]);
assert.throws(() => meter.addBatchObservableCallback(null, []),
              { name: 'TypeError', code: 'ERR_INVALID_ARG_TYPE' });
assert.throws(() => meter.addBatchObservableCallback(() => {}, {}),
              { name: 'TypeError', code: 'ERR_INVALID_ARG_TYPE' });
assert.throws(() => meter.removeBatchObservableCallback(null, []),
              { name: 'TypeError', code: 'ERR_INVALID_ARG_TYPE' });
assert.throws(() => meter.removeBatchObservableCallback(() => {}, {}),
              { name: 'TypeError', code: 'ERR_INVALID_ARG_TYPE' });
const pending = meter.createObservableGauge('pending-callbacks');
let resolveFirst;
let resolveSecond;
let pendingCalls = 0;
pending.addCallback(async () => {
  pendingCalls++;
  await new Promise((resolve) => { resolveFirst = resolve; });
});
pending.addCallback(async () => {
  pendingCalls++;
  await new Promise((resolve) => { resolveSecond = resolve; });
});

(async () => {
  const collectionComplete = () => new Promise((resolve) => setImmediate(resolve));
  nsolid.metrics();
  assert.strictEqual(individualCalls, 1);
  assert.strictEqual(batchCalls, 2);
  assert.strictEqual(remainingBatchCalls, 1);
  assert.strictEqual(duplicateInstrumentCalls, 1);
  assert.strictEqual(pendingCalls, 2);
  nsolid.metrics();
  assert.strictEqual(pendingCalls, 2);
  resolveFirst();
  await collectionComplete();
  nsolid.metrics();
  assert.strictEqual(pendingCalls, 2);
  metrics.disable();
  resolveSecond();
  await collectionComplete();
  nsolid.metrics();
  assert.strictEqual(pendingCalls, 2);
})().catch((error) => {
  setImmediate(() => { throw error; });
});
