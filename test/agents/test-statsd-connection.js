// Flags: --expose-internals

'use strict';

require('../common');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { after, afterEach, before, describe, it } = require('node:test');
const nsolid = require('nsolid');
const dgram = require('dgram');
const net = require('net');
const readline = require('readline');
const stream = require('stream');
const { internalBinding } = require('internal/test/binding');
const bindings = internalBinding('nsolid_statsd_agent');

const expectedMetrics = [
  'blockInputOpCount',
  'blockOutputOpCount',
  'cpuPercent',
  'cpuSystemPercent',
  'cpuUserPercent',
  'ctxSwitchInvoluntaryCount',
  'ctxSwitchVoluntaryCount',
  'freeMem',
  'ipcReceivedCount',
  'ipcSentCount',
  'load15m',
  'load1m',
  'load5m',
  'pageFaultHardCount',
  'pageFaultSoftCount',
  'rss',
  'signalCount',
  'swapCount',
  'systemUptime',
  'timestamp',
  'uptime',
  'activeHandles',
  'activeRequests',
  'dns99Ptile',
  'dnsCount',
  'dnsMedian',
  'eventsProcessed',
  'eventsWaiting',
  'externalMem',
  'fsHandlesClosedCount',
  'fsHandlesOpenedCount',
  'gcCount',
  'gcDurUs99Ptile',
  'gcDurUsMedian',
  'gcForcedCount',
  'gcFullCount',
  'gcMajorCount',
  'heapSizeLimit',
  'heapTotal',
  'heapUsed',
  'httpClient99Ptile',
  'httpClientAbortCount',
  'httpClientCount',
  'httpClientMedian',
  'httpServer99Ptile',
  'httpServerAbortCount',
  'httpServerCount',
  'httpServerMedian',
  'loopAvgTasks',
  'loopEstimatedLag',
  'loopIdlePercent',
  'loopIdleTime',
  'loopIterWithEvents',
  'loopIterations',
  'loopTotalCount',
  'loopUtilization',
  'mallocedMemory',
  'numberOfDetachedContexts',
  'numberOfNativeContexts',
  'peakMallocedMemory',
  'pipeServerCreatedCount',
  'pipeServerDestroyedCount',
  'pipeSocketCreatedCount',
  'pipeSocketDestroyedCount',
  'processingDelay',
  'promiseCreatedCount',
  'promiseResolvedCount',
  'providerDelay',
  'res15m',
  'res1m',
  'res5m',
  'res5s',
  'tcpServerCreatedCount',
  'tcpServerDestroyedCount',
  'tcpSocketCreatedCount',
  'tcpSocketDestroyedCount',
  'threadId',
  'timestamp',
  'totalAvailableSize',
  'totalHeapSizeExecutable',
  'totalPhysicalSize',
  'udpSocketCreatedCount',
  'udpSocketDestroyedCount',
];

const ee = new EventEmitter();
let status_ = 'unconfigured';
bindings._registerStatusCb((status) => {
  if (status !== status_) {
    status_ = status;
    ee.emit('status', status);
  }
});

async function waitForStatus(status) {
  return new Promise((resolve, reject) => {
    if (status_ === status) {
      resolve();
      return;
    }

    ee.on('status', (s) => {
      if (s === status) {
        ee.removeAllListeners('status');
        resolve();
      }
    });
  });
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


nsolid.start({
  interval: 100
});

describe('StatsD status', () => {
  before(() => {
    this.keepAlive = setInterval(() => {
    }, 1000);
  });
  after(() => {
    clearInterval(this.keepAlive);
  });
  afterEach(async () => {
    nsolid.start({
      statsd: null
    });
    return waitForStatus('unconfigured');
  });
  it('should return unconfigured if not started', () => {
    assert.strictEqual(nsolid.statsd.status(), 'unconfigured');
  });
  it('should return initializing if started', async () => {
    assert.strictEqual(nsolid.statsd.status(), 'unconfigured');
    nsolid.start({
      statsd: 'udp://127.0.0.1:8125'
    });

    await waitForStatus('ready');
  });
  it('should be connecting if started and configured using TCP but no statsd server', async () => {
    assert.strictEqual(nsolid.statsd.status(), 'unconfigured');
    nsolid.start({
      statsd: 'tcp://127.0.0.1:8125'
    });
    await waitForStatus('connecting');
  });
  it('should also work starting UDP and then TCP', async () => {
    assert.strictEqual(nsolid.statsd.status(), 'unconfigured');
    nsolid.start({
      statsd: 'udp://127.0.0.1:8125'
    });
    await waitForStatus('ready');
    assert.strictEqual(nsolid.statsd.tcpIp(), null);
    assert.strictEqual(nsolid.statsd.udpIp(), '127.0.0.1:8125');
    nsolid.start({
      statsd: 'tcp://127.0.0.1:8125'
    });
    await waitForStatus('connecting');
  });
  it('should end up ready if started and configured using TCP with statsd server', async (t) => {
    assert.strictEqual(nsolid.statsd.status(), 'unconfigured');
    return startTcpServer(8125, (conn) => {
      const recvMetrics = [];
      this.tcpConnection = conn;
      const rl = readline.createInterface({
        input: conn
      });

      rl.on('line', (line) => {
        assert.ok(line.startsWith(nsolid.statsd.format.bucket()));
        recvMetrics.push(line.split(':')[0].split('.').pop());
        if (recvMetrics.length === expectedMetrics.length) {
          rl.close();
        }
      });

      rl.on('close', () => {
        const diff = expectedMetrics.filter((x) => !recvMetrics.includes(x));
        assert.strictEqual(diff.length, 0);
        this.tcpConnection.destroy();
        this.tcpServer.close();
      });
    }).then((tcpServer) => {
      return new Promise((resolve, reject) => {
        this.tcpServer = tcpServer;
        this.tcpServer.on('close', resolve);
        nsolid.start({
          statsd: 'tcp://127.0.0.1:8125'
        });
        return waitForStatus('ready').then(() => {
          assert.strictEqual(nsolid.statsd.tcpIp(), '127.0.0.1:8125');
          assert.strictEqual(nsolid.statsd.udpIp(), null);
        });
      });
    });
  });
  it('should end up ready if started and configured using UDP with statsd server', async (t) => {
    assert.strictEqual(nsolid.statsd.status(), 'unconfigured');
    const bufferStream = new stream.PassThrough();
    return startUdpServer(8125, (message) => {
      bufferStream.write(message.toString());
    }).then((udpServer) => {
      const recvMetrics = [];
      this.udpServer = udpServer;
      const rl = readline.createInterface({
        input: bufferStream
      });

      rl.on('line', (line) => {
        assert.ok(line.startsWith(nsolid.statsd.format.bucket()));
        recvMetrics.push(line.split(':')[0].split('.').pop());
        if (recvMetrics.length === expectedMetrics.length) {
          rl.close();
        }
      });

      nsolid.start({
        statsd: 'udp://127.0.0.1:8125',
      });

      return waitForStatus('ready').then(() => {
        assert.strictEqual(nsolid.statsd.tcpIp(), null);
        assert.strictEqual(nsolid.statsd.udpIp(), '127.0.0.1:8125');
        return new Promise((resolve, reject) => {
          rl.on('close', () => {
            const diff = expectedMetrics.filter((x) => !recvMetrics.includes(x));
            assert.strictEqual(diff.length, 0);
            this.udpServer.close();
            resolve();
          });
        });
      });
    });
  });
});
