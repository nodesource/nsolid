'use strict';

const common = require('../../common');
const assert = require('assert');
const http = require('http');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (isMainThread) {
  const { setupNSolid } = require('./utils');
  const { checkTracesOnExit } = require('../../common/nsolid-traces');
  const binding = require(`./build/${common.buildType}/binding`);

  setupNSolid({ lookup: false }, common.mustCall(() => {
    const downstream = http.createServer(common.mustCall((req, res) => {
      assert.match(req.headers.traceparent,
                   /^00-[\da-f]{32}-[\da-f]{16}-01$/);
      res.end();
    }));
    downstream.listen(0, '127.0.0.1', common.mustCall(() => {
      const url = `http://127.0.0.1:${downstream.address().port}/`;
      const worker = new Worker(__filename, { workerData: url });
      const workerId = worker.threadId;
      worker.on('error', (err) => { throw err; });
      worker.on('exit', common.mustCall((code) => {
        assert.strictEqual(code, 0);
        downstream.close();
      }));
      worker.once('message', common.mustCall((port) => {
        checkTracesOnExit(binding, [{
          name: 'HTTP GET',
          kind: binding.kClient,
          type: binding.kSpanHttpClient,
          thread_id: 0,
          children: [{
            name: 'HTTP GET',
            kind: binding.kServer,
            type: binding.kSpanHttpServer,
            thread_id: workerId,
            children: [{
              name: 'HTTP GET',
              kind: binding.kClient,
              type: binding.kSpanHttpClient,
              thread_id: workerId,
              attributes: { 'http.url': url, 'http.status_code': 200 },
              children: [{
                name: 'HTTP GET',
                kind: binding.kServer,
                type: binding.kSpanHttpServer,
                thread_id: 0,
              }],
            }],
          }],
        }]);
        http.get(`http://127.0.0.1:${port}/`, common.mustCall((res) => {
          res.resume();
        }));
      }));
    }));
  }));
} else {
  const front = http.createServer(common.mustCall(async (req, res) => {
    const response = await fetch(workerData);
    await response.text();
    res.end();
    front.close();
  }));
  front.listen(0, '127.0.0.1', common.mustCall(() => {
    parentPort.postMessage(front.address().port);
  }));
}
