'use strict';
const common = require('../../common');
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
