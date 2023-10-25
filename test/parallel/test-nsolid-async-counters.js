'use strict';

const common = require('../common');
const assert = require('assert');
const dgram = require('dgram');
const net = require('net');
const nsolid = require('nsolid');

{
  const socket = dgram.createSocket('udp4');
  nsolid.metrics(common.mustCall((er, m) => {
    assert.strictEqual(er, null);
    assert.strictEqual(m.udpSocketCreatedCount, 1);
    assert.strictEqual(m.udpSocketDestroyedCount, 0);
    socket.close(common.mustCall(() => {
      setTimeout(() => {
        nsolid.metrics((er, m) => {
          assert.strictEqual(er, null);
          assert.strictEqual(m.udpSocketCreatedCount, 1);
          assert.strictEqual(m.udpSocketDestroyedCount, 1);
        });
      }, 100);
    }));
  }));
}

{
  const server = net.createServer(common.mustCall((socket) => {
    setTimeout(() => {
      nsolid.metrics(common.mustCall((er, m) => {
        assert.strictEqual(er, null);
        assert.strictEqual(m.tcpSocketCreatedCount, 2);
        assert.strictEqual(m.tcpSocketDestroyedCount, 0);
        socket.end();
      }));
    }, 100);
  }));

  server.listen(0, common.mustCall(() => {
    nsolid.metrics(common.mustCall((er, m) => {
      assert.strictEqual(er, null);
      assert.strictEqual(m.tcpServerCreatedCount, 1);
      assert.strictEqual(m.tcpServerDestroyedCount, 0);
    }));

    const socket = net.connect(server.address().port, common.mustCall(() => {
      setTimeout(() => {
        socket.on('close', common.mustCall(() => {
          setTimeout(() => {
            nsolid.metrics(common.mustCall((er, m) => {
              assert.strictEqual(er, null);
              assert.strictEqual(m.tcpSocketCreatedCount, 2);
              assert.strictEqual(m.tcpSocketDestroyedCount, 2);
            }));

            server.close(common.mustCall(() => {
              setTimeout(() => {
                nsolid.metrics(common.mustCall((er, m) => {
                  assert.strictEqual(er, null);
                  assert.strictEqual(m.tcpServerCreatedCount, 1);
                  assert.strictEqual(m.tcpServerDestroyedCount, 1);
                }));
              }, 100);
            }));
          }, 100);
        }));
      }, 100);
    }));
  }));
}
