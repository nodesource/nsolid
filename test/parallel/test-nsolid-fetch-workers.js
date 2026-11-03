'use strict';

const common = require('../common');
const assert = require('assert');
const http = require('http');
const nsolid = require('nsolid');
const { Worker, isMainThread, workerData } = require('worker_threads');

const WORKERS = 10;

if (!isMainThread) {
  fetch(`http://127.0.0.1:${workerData.port}`).then(() => {
    assert.ok(!Object.hasOwn(nsolid.traceStats, 'httpClientCount'));
    assert.strictEqual(nsolid.traceStats.httpClientAbortCount, 0);
    assert.ok(!Object.hasOwn(nsolid.traceStats, 'httpServerCount'));
    assert.strictEqual(nsolid.traceStats.httpServerAbortCount, 0);
  }).then(common.mustCall());
  return;
}

const server = http.createServer(common.mustCall((req, res) => {
  res.end();
}, WORKERS));

server.listen(0, '127.0.0.1', common.mustSucceed(async () => {
  let endedWorkers = 0;
  for (let i = 0; i < WORKERS; i++) {
    const w = new Worker(__filename,
                         { workerData: { port: server.address().port } });
    w.on('exit', common.mustCall(() => {
      if (++endedWorkers === WORKERS) {
        assert.ok(!Object.hasOwn(nsolid.traceStats, 'httpClientCount'));
        assert.strictEqual(nsolid.traceStats.httpClientAbortCount, 0);
        assert.ok(!Object.hasOwn(nsolid.traceStats, 'httpServerCount'));
        assert.strictEqual(nsolid.traceStats.httpServerAbortCount, 0);
        server.close();
      }
    }));
  }
}));
