'use strict';

const { buildType, mustCall, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const binding = require(bindingPath);
const { Worker,
        isMainThread,
        threadId,
        BroadcastChannel,
        parentPort } = require('worker_threads');

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Test must first run as the main thread');

const MAX_THREADS = 5;

const bc = new BroadcastChannel('threadIds');

if (isMainThread) {
  let online = 0;
  let done = 0;
  const threadIds = [ threadId ];
  for (let i = 0; i < MAX_THREADS; i++) {
    const worker = new Worker(__filename, { argv: [process.pid] });
    threadIds.push(worker.threadId);
    worker.on('exit', mustCall((code) => {
      assert.strictEqual(code, 0);
      if (--online === 0) {
        test(threadIds, false);
        bc.close();
      }
    }));
    worker.on('message', mustCall((msg) => {
      if (msg === 'ready') {
        if (++online === MAX_THREADS) {
          bc.postMessage({ type: 'test', data: threadIds });
          test(threadIds, true);
        }
      } else if (msg === 'done') {
        if (++done === MAX_THREADS) {
          bc.postMessage({ type: 'close', data: null });
        }
      }
    }, 2));
  }
} else {
  bc.onmessage = (event) => {
    const { type, data } = event.data;
    if (type === 'test') {
      test(data, true);
      parentPort.postMessage('done');
    } else if (type === 'close') {
      bc.close();
    }
  };

  parentPort.postMessage('ready');
}

function test(threadIds, expectedResult) {
  for (let i = 0; i < threadIds.length; ++i) {
    const tid = threadIds[i];
    if (tid !== threadId)
      assert.strictEqual(binding.getEnvInst(tid), expectedResult);
    else
      assert.strictEqual(binding.getEnvInst(tid), true);
  }
}
