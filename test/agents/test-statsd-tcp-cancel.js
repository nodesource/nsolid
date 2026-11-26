'use strict';

const common = require('../common');
const net = require('node:net');
const nsolid = require('nsolid');

const server = net.createServer(common.mustCall((socket) => {
  socket.pause();
  function write() {
    if (nsolid.statsd.status() !== 'ready') return setImmediate(write);
    // Several independent writes must still be outstanding when closing.
    const payload = 'x'.repeat(64 * 1024);
    for (let i = 0; i < 256; i++) nsolid.statsd.sendRaw(payload);
    setTimeout(common.mustCall(() => {
      nsolid.start({ statsd: null });
      socket.destroy();
      server.close();
    }), 20);
  }
  write();
}));
server.on('error', common.mustNotCall());
server.listen(0, '127.0.0.1', common.mustCall(() => {
  nsolid.start({ statsd: `tcp://127.0.0.1:${server.address().port}`,
                 pauseMetrics: true });
}));
