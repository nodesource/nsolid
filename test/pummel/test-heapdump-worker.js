'use strict';
// This tests heap snapshot integration of worker.

const common = require('../common');
const { validateByRetainingPath } = require('../common/heap');
const { Worker } = require('worker_threads');
const assert = require('assert');

// TODO(trevnorris): Investigate why this says EnvInst isn't being cleaned
// up on the call to terminate() in this case.
if (process.config.variables.asan)
  common.skip('Skip flaky test');

// Before worker is used, no MessagePort should be created.
{
  const nodes = validateByRetainingPath('Node / Worker', []);
  assert.strictEqual(nodes.length, 0);
}

const worker = new Worker('setInterval(() => {}, 100);', { eval: true });
// When a worker is alive, a Worker instance and its message port should be captured.
{
  validateByRetainingPath('Node / Worker', [
    { node_name: 'Worker', edge_name: 'native_to_javascript' },
    { node_name: 'MessagePort', edge_name: 'messagePort' },
    { node_name: 'Node / MessagePort', edge_name: 'javascript_to_native' },
    { node_name: 'Node / MessagePortData', edge_name: 'data' },
  ]);
}

worker.terminate();
