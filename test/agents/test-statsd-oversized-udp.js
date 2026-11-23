'use strict';

const common = require('../common');
const assert = require('node:assert');
const dgram = require('node:dgram');
const nsolid = require('nsolid');
const server = dgram.createSocket('udp4');
const expected = ['x'.repeat(1401), 'valid:1|c'];
server.on('message', common.mustCall((message) => {
  assert.strictEqual(message.toString(), `${expected.shift()}\n`);
  if (expected.length > 0) return;
  nsolid.start({ statsd: null });
  server.close();
}, 2));
server.bind(0, '127.0.0.1', common.mustCall(() => {
  nsolid.start({ statsd: `udp://127.0.0.1:${server.address().port}`,
                 pauseMetrics: true });
  function send() {
    if (nsolid.statsd.status() !== 'ready') return setImmediate(send);
    nsolid.statsd.sendRaw([...expected]);
  }
  send();
}));
