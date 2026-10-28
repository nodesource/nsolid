'use strict';

const { skip } = require('../common');
const { Worker, isMainThread } = require('worker_threads');

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Main thread must be this script');
if (!process.features.debug)
  skip('This only fails with a debug build');

if (!isMainThread) {
  require('v8').getHeapSnapshot();
  return;
}

new Worker(__filename, { argv: [process.pid] });
const t = Date.now();
while (Date.now() - t < 1000);
