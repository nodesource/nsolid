// Flags: --expose-internals
'use strict';
const common = require('../common');
const assert = require('node:assert');
const dgram = require('node:dgram');
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const { internalBinding } = require('internal/test/binding');
const binding = internalBinding('nsolid_statsd_agent');
const nsolid = require('nsolid');

function checkStopped() {
  assert.strictEqual(nsolid.statsd.status(), 'unconfigured');
  assert.strictEqual(nsolid.statsd.tcpIp(), null);
  assert.strictEqual(nsolid.statsd.udpIp(), null);
  assert.strictEqual(binding.send(['stopped:1|c']), -1);
}

if (!isMainThread) {
  let reads = 0;
  let immediate;
  function readAndSend() {
    for (let i = 0; i < 100; i++) {
      assert.strictEqual(nsolid.statsd.tcpIp(), null);
      const address = nsolid.statsd.udpIp();
      assert.ok(address === null || typeof address === 'string');
      const formatted = nsolid.statsd.format.counter('worker_counter', 42);
      assert.ok(formatted.includes('.worker_counter:42|c'));
      const result = nsolid.statsd.sendRaw(formatted);
      assert.ok(result === 0 || result === -1);
      const nativeResult = binding.send([formatted]);
      assert.ok(nativeResult === 0 || nativeResult === -1);
      reads++;
    }
    immediate = setImmediate(readAndSend);
  }
  parentPort.on('message', common.mustCall(() => {
    clearImmediate(immediate);
    checkStopped();
    assert.ok(reads > 0);
    console.log(`Worker StatsD reconfiguration: ${reads} reads and sends`);
    parentPort.close();
  }));
  readAndSend();
  parentPort.postMessage('ready');
} else {
  checkStopped();
  const servers = [dgram.createSocket('udp4'), dgram.createSocket('udp4')];
  const workers = [];
  let bound = 0;
  let ready = 0;
  let changes = 0;

  function reconfigure() {
    const server = servers[changes % servers.length];
    const address = `127.0.0.1:${server.address().port}`;
    nsolid.start({ statsd: `udp://${address}`, interval: 0 });
    function waitForAddress() {
      if (nsolid.statsd.udpIp() !== address) {
        setImmediate(waitForAddress);
        return;
      }
      assert.strictEqual(nsolid.statsd.tcpIp(), null);
      if (++changes < 50) {
        setImmediate(reconfigure);
      } else {
        nsolid.start({ statsd: null });
        waitForStop();
      }
    }
    waitForAddress();
  }

  function waitForStop() {
    if (nsolid.statsd.status() !== 'unconfigured') {
      setImmediate(waitForStop);
      return;
    }
    checkStopped();
    console.log(`Main StatsD: ${changes} endpoint changes and shutdown`);
    for (const worker of workers) worker.postMessage('stop');
    for (const server of servers) server.close();
  }

  for (const server of servers) {
    server.bind(0, '127.0.0.1', common.mustCall(() => {
      if (++bound !== servers.length) return;
      for (let i = 0; i < 2; i++) {
        const worker = new Worker(__filename);
        workers.push(worker);
        worker.on('error', (err) => { throw err; });
        worker.on('exit', common.mustCall((code) => {
          assert.strictEqual(code, 0);
        }));
        worker.on('message', common.mustCall((message) => {
          assert.strictEqual(message, 'ready');
          if (++ready === workers.length) reconfigure();
        }));
      }
    }));
  }
}
