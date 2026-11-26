'use strict';
const common = require('../../common');
const { isMainThread } = require('worker_threads');

// Unloading the addon from a worker would destroy its queue and leave the
// N|Solid thread with work whose code is gone.
if (!isMainThread)
  common.skip('the addon must not be unloaded from a worker');

const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

binding.runDispatch();
binding.enqueueItem();
setTimeout(() => {
  binding.enqueueItem();
}, 10);
setTimeout(() => {
  binding.enqueueItem();
  binding.enqueueItem();
  binding.enqueueItem();
  binding.enqueueItem();
}, 100);
setTimeout(() => {
  binding.enqueueItem();
  binding.enqueueItem();
  binding.enqueueItem();
  binding.enqueueItem();
}, 200);
setTimeout(() => {}, 300);
