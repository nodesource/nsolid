'use strict';

const nsolid = require('nsolid');
const { internalBinding } = require('internal/test/binding');
const { UV_EEXIST } = internalBinding('uv');
const { platformTimeout } = require('../common');

module.exports = function snapshotBurst(count, defer) {
  if (defer) {
    internalBinding('nsolid_zmq_agent').deferProfileRegistrationForTesting();
  }

  // Keep enough live objects for each snapshot to span many collector chunks.
  globalThis.snapshotBurstHeap = Array.from({ length: 100_000 }, (_, i) => ({
    index: i,
    value: `snapshot-burst-${i}`,
  }));
  const deadline = Date.now() + platformTimeout(30_000);
  function takeNext() {
    try {
      nsolid.snapshot();
    } catch (err) {
      // Core cleanup runs on another thread, independently of asset delivery.
      if (err.code !== UV_EEXIST || Date.now() >= deadline) throw err;
      setTimeout(takeNext, 1);
      return;
    }
    if (--count > 0) setImmediate(takeNext);
  }
  takeNext();
};
