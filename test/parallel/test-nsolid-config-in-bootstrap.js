'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

const ini_config = nsolid.config;

// The config object should populate correctly
assert.ok(Object.keys(ini_config).length > 0);

// Allow nsolid to run start() after bootstrap.
setImmediate(common.mustCall(function() {
  const now_config = nsolid.config;
  // Loop through the initial config object and make sure all the same
  // properties exist.
  for (const k in ini_config) {
    assert.ok(Object.hasOwn(now_config, k));
  }
}));
