'use strict';

const { buildType, mustCall, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const binding = require(bindingPath);
const { Worker, isMainThread, threadId } =
  require('worker_threads');

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Test must first run as the main thread');

if (isMainThread) {
  for (let i = 0; i < 5; i++)
    createWorker();
  // Not returning early because we want to run the same test on the main thread
  // as all the Worker threads.
}

block_for(450);
setTimeout(() => block_for(500), 237);

function block_for(ms) {
  binding.resetTest(threadId);
  const t = Date.now();
  while (Date.now() - t < ms);
}

function createWorker() {
  const worker = new Worker(__filename, { argv: [process.pid] });
  worker.on('exit', mustCall((code) => assert(code === 0)));
}
