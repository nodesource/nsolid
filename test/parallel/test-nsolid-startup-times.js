'use strict';

require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

process.on('exit', () => {
  const startupTimes = nsolid.startupTimes();
  console.log(startupTimes);
  assert.strictEqual(startupTimes.timeOrigin[1], 0);
  assert.strictEqual(startupTimes.timeOrigin[0], 0);
  assert(startupTimes.initialized_node[1] > 0);
  assert.strictEqual(startupTimes.initialized_node[0], 0);
  assert(startupTimes.initialized_v8[1] > 0);
  assert.strictEqual(startupTimes.initialized_v8[0], 0);
  assert(startupTimes.initialized_v8[1] > startupTimes.initialized_node[1]);
  assert(startupTimes.loaded_environment[1] > 0);
  assert.strictEqual(startupTimes.loaded_environment[0], 0);
  assert(startupTimes.loaded_environment[1] > startupTimes.initialized_v8[1]);
  assert(startupTimes.bootstrap_complete[1] > 0);
  assert.strictEqual(startupTimes.bootstrap_complete[0], 0);
  assert(startupTimes.bootstrap_complete[1] > startupTimes.loaded_environment[1]);
  assert(startupTimes.loop_start[1] > 0);
  assert.strictEqual(startupTimes.loop_start[0], 0);
  assert(startupTimes.loop_start[1] > startupTimes.bootstrap_complete[1]);
  assert(startupTimes.loop_exit[1] > 0);
  assert.strictEqual(startupTimes.loop_exit[0], 0);
  assert(startupTimes.loop_exit[1] > startupTimes.loop_start[1]);
});
