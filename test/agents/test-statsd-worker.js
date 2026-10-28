// Flags: --expose-internals
'use strict';
const common = require('../common');
const assert = require('node:assert');
const dgram = require('node:dgram');
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const nsolid = require('nsolid');

if (!isMainThread) {
  const formatted = nsolid.statsd.format.counter('worker_counter', 42);
  assert.ok(formatted.endsWith('.worker_counter:42|c'));
  assert.strictEqual(nsolid.statsd.sendRaw(formatted), 0);
  console.log(`Worker StatsD: ${formatted}`);
  parentPort.postMessage(formatted);
} else {
  const server = dgram.createSocket('udp4');
  server.on('message', common.mustCall((data) => {
    assert.ok(data.toString().includes('.worker_counter:42|c'));
    server.close();
  }));
  server.bind(0, '127.0.0.1', common.mustCall(() => {
    nsolid.start({ statsd: `udp://127.0.0.1:${server.address().port}`,
                   interval: 0 });
    const timer = setInterval(common.mustCallAtLeast(() => {
      if (nsolid.statsd.status() !== 'ready') return;
      clearInterval(timer);
      const worker = new Worker(__filename);
      worker.on('error', (err) => { throw err; });
      worker.on('message', common.mustCall((formatted) => {
        assert.ok(formatted.includes('.worker_counter:42|c'));
      }));
      worker.on('exit', common.mustCall((code) => assert.strictEqual(code, 0)));
    }), 10);
  }));
}
