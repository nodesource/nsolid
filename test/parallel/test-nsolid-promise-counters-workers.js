'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const { Worker, isMainThread, parentPort } = require('worker_threads');

if (!isMainThread) {
  const { promiseCreatedCount, promiseResolvedCount } = nsolid.metrics();
  let createdCount = promiseCreatedCount;
  let resolvedCount = promiseResolvedCount;
  parentPort.on('message', (count) => {
    switch (count) {
      case 0:
        new Promise((resolve) => resolve());
        nsolid.metrics(common.mustSucceed((m) => {
          assert.strictEqual(m.promiseCreatedCount, ++createdCount);
          assert.strictEqual(m.promiseResolvedCount, ++resolvedCount);
          parentPort.postMessage(++count);
        }));
        break;

      case 1:
        new Promise((resolve) => resolve());
        nsolid.metrics(common.mustSucceed((m) => {
          assert.strictEqual(m.promiseCreatedCount, createdCount);
          assert.strictEqual(m.promiseResolvedCount, resolvedCount);
          parentPort.postMessage(++count);
        }));
        break;

      case 2:
        new Promise((resolve) => resolve());
        nsolid.metrics(common.mustSucceed((m) => {
          assert.strictEqual(m.promiseCreatedCount, ++createdCount);
          assert.strictEqual(m.promiseResolvedCount, ++resolvedCount);
          process.exit(0);
        }));
        break;
    }
  });
} else {
  nsolid.start({
    promiseTracking: true
  });

  const worker = new Worker(__filename);
  worker.on('message', (count) => {
    if (count % 2) {
      nsolid.start({
        promiseTracking: false
      });
    } else {
      nsolid.start({
        promiseTracking: true
      });
    }

    worker.postMessage(count);
  });
  worker.postMessage(0);
}
