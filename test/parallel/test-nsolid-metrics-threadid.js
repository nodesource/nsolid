'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const { Worker, parentPort, threadId } = require('worker_threads');

if (!common.isMainThread) {
  parentPort.postMessage(nsolid.metrics().threadId);
  return;
}

assert.strictEqual(nsolid.metrics().threadId, threadId);
for (let i = 0; i < 5; i++) {
  const w = new Worker(__filename);
  w.once('message', common.mustCall((data) => {
    assert.strictEqual(data, w.threadId);
  }));
}
