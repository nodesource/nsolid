'use strict';
const common = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);
const nsolid = require('nsolid');

nsolid.start();

setTimeout(function r() {
  const count = binding.checkConfig();
  if (count === 0) {
    return setTimeout(r, 10);
  }

  // Change config, config hook should be called
  nsolid.start({ command: 9000 });
  setTimeout(function r1() {
    const new_count = binding.checkConfig();
    if (new_count === count) {
      return setTimeout(r1, 10);
    }

    assert.strictEqual(new_count, count + 1);
    // Don't change config, so config hooks should not be called
    nsolid.start({ command: 9000 });
    setTimeout(() => {
      assert.strictEqual(new_count, binding.checkConfig());
    }, 100);
  }, 10);
}, 10);
