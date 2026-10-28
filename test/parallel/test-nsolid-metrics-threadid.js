'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const { Worker, isMainThread, parentPort, threadId } = require('worker_threads');

let observableCalls = 0;
nsolid.otel.api.metrics.getMeter('runtime-metrics')
  .createObservableGauge('unused')
  .addCallback(() => observableCalls++);
const metrics = nsolid.metrics();
assert.strictEqual(observableCalls, 0);

if (!isMainThread) {
  parentPort.postMessage(metrics.threadId);
  return;
}

assert.strictEqual(metrics.threadId, threadId);
for (let i = 0; i < 5; i++) {
  const w = new Worker(__filename);
  w.once('message', common.mustCall((data) => {
    assert.strictEqual(data, w.threadId);
  }));
}
