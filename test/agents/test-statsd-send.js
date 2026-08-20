// Flags: --expose-internals

'use strict';

const common = require('../common');
const assert = require('node:assert');
const { afterEach, describe, it } = require('node:test');
const nsolid = require('nsolid');
const dgram = require('dgram');
const net = require('net');
const readline = require('readline');
const stream = require('stream');

function waitForStatus(status, done) {
  const interval = setInterval(() => {
    if (nsolid.statsd.status() === status) {
      clearInterval(interval);
      done();
    }
  }, 10);
}

async function startTcpServer(port, cb) {
  const server = net.createServer(cb);
  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      resolve(server);
    });
  });
}

async function startUdpServer(port, cb) {
  const server = dgram.createSocket('udp4');
  return new Promise((resolve, reject) => {
    server.on('message', cb);
    server.on('listening', () => {
      resolve(server);
    });
    server.bind(port);
  });
}

function testTcpSendMetrics() {
  assert.strictEqual(nsolid.statsd.status(), 'unconfigured');
  let tcpConnection;
  let tcpServer;

  function handleTcpConnection(conn) {
    let times = 0;
    tcpConnection = conn;
    const rl = readline.createInterface({
      input: conn,
    });

    function onLine(line) {
      assert.ok(line.startsWith(nsolid.statsd.format.bucket()));
      switch (times++) {
        case 0:
          assert.ok(line.endsWith('.name:val|c'));
          break;
        case 1:
          assert.ok(line.endsWith('.name:val|g'));
          break;
        case 2:
          assert.ok(line.endsWith('.name:val|s'));
          break;
        case 3:
          assert.ok(line.endsWith('.name:val|ms'));
          rl.close();
          break;
        default:
          assert.fail();
      }
    }

    function onClose() {
      tcpConnection.destroy();
      tcpServer.close();
    }

    rl.on('line', common.mustCall(onLine, 4));
    rl.on('close', common.mustCall(onClose));
  }

  return startTcpServer(8125, handleTcpConnection).then((server) => {
    return new Promise((resolve, reject) => {
      tcpServer = server;
      tcpServer.on('close', resolve);
      nsolid.start({
        statsd: 'tcp://127.0.0.1:8125',
      });
      waitForStatus('ready', common.mustCall(() => {
        assert.strictEqual(nsolid.statsd.tcpIp(), '127.0.0.1:8125');
        assert.strictEqual(nsolid.statsd.udpIp(), null);
        nsolid.statsd.counter('name', 'val');
        nsolid.statsd.gauge('name', 'val');
        nsolid.statsd.set('name', 'val');
        nsolid.statsd.timing('name', 'val');
      }));
    });
  });
}

function testUdpSendMetrics() {
  assert.strictEqual(nsolid.statsd.status(), 'unconfigured');
  const bufferStream = new stream.PassThrough();
  let udpServer;

  function handleUdpMessage(message) {
    bufferStream.write(message.toString());
  }

  return startUdpServer(8125, handleUdpMessage).then((server) => {
    return new Promise((resolve, reject) => {
      let times = 0;
      udpServer = server;
      const rl = readline.createInterface({
        input: bufferStream,
      });

      function onLine(line) {
        assert.ok(line.startsWith(nsolid.statsd.format.bucket()));
        switch (times++) {
          case 0:
            assert.ok(line.endsWith('.name:val|c'));
            break;
          case 1:
            assert.ok(line.endsWith('.name:val|g'));
            break;
          case 2:
            assert.ok(line.endsWith('.name:val|s'));
            break;
          case 3:
            assert.ok(line.endsWith('.name:val|ms'));
            rl.close();
            break;
          default:
            assert.fail();
        }
      }

      function onClose() {
        udpServer.close();
        resolve();
      }

      rl.on('line', common.mustCall(onLine, 4));
      rl.on('close', common.mustCall(onClose));

      nsolid.start({
        statsd: 'udp://127.0.0.1:8125',
      });
      waitForStatus('ready', common.mustCall(() => {
        assert.strictEqual(nsolid.statsd.tcpIp(), null);
        assert.strictEqual(nsolid.statsd.udpIp(), '127.0.0.1:8125');
        nsolid.statsd.counter('name', 'val');
        nsolid.statsd.gauge('name', 'val');
        nsolid.statsd.set('name', 'val');
        nsolid.statsd.timing('name', 'val');
      }));
    });
  });
}

describe('sending custom metrics', () => {
  afterEach((t, done) => {
    nsolid.start({
      statsd: null,
    });
    waitForStatus('unconfigured', done);
  });
  it('should work with TCP', testTcpSendMetrics);
  it('should work with UDP', testUdpSendMetrics);
});
