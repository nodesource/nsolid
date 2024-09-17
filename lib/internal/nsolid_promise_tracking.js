'use strict';

const binding = internalBinding('nsolid_api');
const { isMainThread } = internalBinding('worker');
const { trackPromises } = require('internal/async_hooks');

module.exports = {
  init,
};

function init() {
  binding.setTrackPromisesFn(trackPromises);
  if (!isMainThread) {
    // In case it's a worker thread not just set the trackPromisesFn but also
    // check whether the promiseTracking configuration option is activated and
    // start tracking promises right away.
    const config = binding.getConfig();
    if (config && config.promiseTracking)
      trackPromises(true);
  }
}
