'use strict';

const { buildType, mustCall, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const binding = require(bindingPath);
const { Worker, isMainThread, parentPort } = require('worker_threads');
const workerList = [];

if (process.env.NSOLID_COMMAND)
  skip('required to run without the Console');

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Test must first run as the main thread');

if (isMainThread) {
  spawnWorker();
} else {
  parentPort.on('message', () => process.exit());
}

function spawnWorker() {
  if (workerList.length > 4) {
    for (let w of workerList)
      w.postMessage('bye');
    return;
  }
  const w = new Worker(__filename, { argv: [process.pid] });
  w.on('online', () => {
    // Add 1 for the main thread.
    assert.strictEqual(binding.checkEnvCount(), workerList.length + 1);
    spawnWorker();
  });
  workerList.push(w);
}
