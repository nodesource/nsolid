'use strict';

const common = require('../common');
const assert = require('assert');
const dgram = require('dgram');
const net = require('net');
const nsolid = require('nsolid');

process.once('beforeExit', () => {
  setTimeout(() => {
    nsolid.metrics(common.mustSucceed((m) => {
      assert.strictEqual(m.udpSocketCreatedCount, 1);
      assert.strictEqual(m.udpSocketDestroyedCount, 1);
      assert.strictEqual(m.tcpServerCreatedCount, 1);
      assert.strictEqual(m.tcpServerDestroyedCount, 1);
      assert.strictEqual(m.tcpSocketCreatedCount, 2);
      assert.strictEqual(m.tcpSocketDestroyedCount, 2);
    }));
  }, 200);
});

{
  const socket = dgram.createSocket('udp4');
  nsolid.metrics(common.mustSucceed((m) => {
    assert.strictEqual(m.udpSocketCreatedCount, 1);
    assert.strictEqual(m.udpSocketDestroyedCount, 0);
    socket.close(common.mustSucceed(() => {}));
  }));
}

{
  const server = net.createServer(common.mustCall((socket) => {
    setTimeout(() => {
      nsolid.metrics(common.mustSucceed((m) => {
        assert.strictEqual(m.tcpSocketCreatedCount, 2);
        assert.strictEqual(m.tcpSocketDestroyedCount, 0);
        socket.end();
      }));
    }, 100);
  }));

  server.listen(0, common.mustCall(() => {
    nsolid.metrics(common.mustSucceed((m) => {
      assert.strictEqual(m.tcpServerCreatedCount, 1);
      assert.strictEqual(m.tcpServerDestroyedCount, 0);
    }));

    const socket = net.connect(server.address().port, common.mustSucceed(() => {
      socket.on('close', common.mustCall(() => {
        server.close(common.mustSucceed(() => {}));
      }));
    }));
  }));
}
