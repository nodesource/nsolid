// Flags: --expose-internals
'use strict';
const common = require('../common');
const { validateSnapshotNodes } = require('../common/heap');
const { Worker } = require('worker_threads');

// TODO(trevnorris): Investigate why this says EnvInst isn't being cleaned
// up on the call to terminate() in this case.
if (process.config.variables.asan)
  common.skip('Skip flaky test');

validateSnapshotNodes('Node / Worker', []);
const worker = new Worker('setInterval(() => {}, 100);', { eval: true });
validateSnapshotNodes('Node / MessagePort', [
  {
    children: [
      { node_name: 'Node / MessagePortData', edge_name: 'data' },
    ],
  },
], { loose: true });
worker.terminate();
