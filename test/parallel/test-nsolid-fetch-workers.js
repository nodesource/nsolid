'use strict';

const common = require('../common');
const assert = require('assert');
const http = require('http');
const nsolid = require('nsolid');
const { Worker, isMainThread, workerData } = require('worker_threads');

const WORKERS = 10;

if (!isMainThread) {
  fetch(`http://127.0.0.1:${workerData.port}`).then(() => {
    assert.strictEqual(nsolid.traceStats.httpClientCount, 1);
    assert.strictEqual(nsolid.traceStats.httpClientAbortCount, 0);
    assert.strictEqual(nsolid.traceStats.httpServerCount, 0);
    assert.strictEqual(nsolid.traceStats.httpServerAbortCount, 0);
    setTimeout(() => {
      const metrics = nsolid.metrics();
      assert.ok(metrics.httpClientMedian > 0);
      assert.ok(metrics.httpClient99Ptile > 0);
    }, 3500);
  });
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
        assert.strictEqual(nsolid.traceStats.httpClientCount, 0);
        assert.strictEqual(nsolid.traceStats.httpClientAbortCount, 0);
        assert.strictEqual(nsolid.traceStats.httpServerCount, WORKERS);
        assert.strictEqual(nsolid.traceStats.httpServerAbortCount, 0);
        server.close();
      }
    }));
  }
}));
