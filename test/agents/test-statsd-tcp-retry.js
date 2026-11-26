'use strict';

const common = require('../common');
const assert = require('node:assert');
const net = require('node:net');
const nsolid = require('nsolid');
const readline = require('node:readline');

let connections = 0;
let message = 'before:1|c';
let timer;
const server = net.createServer(common.mustCall((socket) => {
  const connection = ++connections;
  const lines = readline.createInterface({ input: socket });
  lines.once('line', common.mustCall((line) => {
    lines.close();
    if (connection === 1) {
      assert.strictEqual(line, 'before:1|c');
      message = 'retry:1|c';
      // Keep the listener bound while breaking the established connection.
      socket.end(common.mustCall(() => socket.destroy()));
      return;
    }
    assert.strictEqual(line, 'retry:1|c');
    clearInterval(timer);
    nsolid.start({ statsd: null });
    socket.destroy();
    server.close();
  }));
}, 2));
server.on('error', common.mustNotCall());
server.listen(0, '127.0.0.1', common.mustCall(() => {
  nsolid.start({ statsd: `tcp://127.0.0.1:${server.address().port}`,
                 pauseMetrics: true });
  timer = setInterval(() => {
    if (nsolid.statsd.status() === 'ready') nsolid.statsd.sendRaw(message);
  }, 10);
}));
