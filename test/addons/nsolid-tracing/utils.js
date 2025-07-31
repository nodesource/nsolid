'use strict';

const common = require('../../common');
const { isMainThread } = require('worker_threads');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

function setupNSolid(options, cb) {
  if (!isMainThread) {
    return cb();
  }
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  if (options.lookup === undefined) {
    options.lookup = true;
  }

  if (options.lookup === true) {
    const dns = require('dns');
    dns.lookup('localhost', { all: true }, common.mustSucceed((addresses) => {
      binding.setupTracing();
      cb(null, { addresses });
    }));
  } else {
    binding.setupTracing();
    cb();
  }
}

module.exports = {
  setupNSolid,
};
