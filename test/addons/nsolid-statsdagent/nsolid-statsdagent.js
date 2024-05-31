'use strict';

const { buildType, mustCall, mustCallAtLeast, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const binding = require(bindingPath);
const net = require('net');
const { isMainThread } = require('worker_threads');

let expectedProcMetrics = [
  'timestamp',
  'uptime',
  'systemUptime',
  'freeMem',
  'blockInputOpCount',
  'blockOutputOpCount',
  'ctxSwitchInvoluntaryCount',
  'ctxSwitchVoluntaryCount',
  'ipcReceivedCount',
  'ipcSentCount',
  'pageFaultHardCount',
  'pageFaultSoftCount',
  'signalCount',
  'swapCount',
  'rss',
  'load1m',
  'load5m',
  'load15m',
  'cpuUserPercent',
  'cpuSystemPercent',
  'cpuPercent',
];

let expectedThreadMetrics = [
  'threadId',
  'timestamp',
  'activeHandles',
  'activeRequests',
  'heapTotal',
  'totalHeapSizeExecutable',
  'totalPhysicalSize',
  'totalAvailableSize',
  'heapUsed',
  'heapSizeLimit',
  'mallocedMemory',
  'externalMem',
  'peakMallocedMemory',
  'numberOfNativeContexts',
  'numberOfDetachedContexts',
  'gcCount',
  'gcForcedCount',
  'gcFullCount',
  'gcMajorCount',
  'dnsCount',
  'httpClientAbortCount',
  'httpClientCount',
  'httpServerAbortCount',
  'httpServerCount',
  'loopIdleTime',
  'loopIterations',
  'loopIterWithEvents',
  'eventsProcessed',
  'eventsWaiting',
  'providerDelay',
  'processingDelay',
  'loopTotalCount',
  'pipeServerCreatedCount',
  'pipeServerDestroyedCount',
  'pipeSocketCreatedCount',
  'pipeSocketDestroyedCount',
  'tcpServerCreatedCount',
  'tcpServerDestroyedCount',
  'tcpSocketCreatedCount',
  'tcpSocketDestroyedCount',
  'udpSocketCreatedCount',
  'udpSocketDestroyedCount',
  'promiseCreatedCount',
  'promiseResolvedCount',
  'fsHandlesOpenedCount',
  'fsHandlesClosedCount',
  'gcDurUs99Ptile',
  'gcDurUsMedian',
  'dns99Ptile',
  'dnsMedian',
  'httpClient99Ptile',
  'httpClientMedian',
  'httpServer99Ptile',
  'httpServerMedian',
  'loopUtilization',
  'res5s',
  'res1m',
  'res5m',
  'res15m',
  'loopAvgTasks',
  'loopEstimatedLag',
  'loopIdlePercent',
];

if (process.env.NSOLID_COMMAND)
  skip('required to run without the Console');

if (!isMainThread)
  skip('Test must be run as the main thread');

const server = net.createServer(mustCall((socket) => {
  assert.strictEqual(binding.getStatus(), 'ready');
  socket.on('data', mustCallAtLeast((d) => {
    const lines = d.toString()
      .split('\n')
      .filter((e) => e.length > 0)
      .map((e) => e.split('|'));
    for (const e of lines) {
      const s = e[0].split('.');
      const m = s[1].split(':')[0];
      if (s[0] === 'proc') {
        assert.ok(expectedProcMetrics.includes(m), m);
        expectedProcMetrics = expectedProcMetrics.filter((x) => x !== m);
      } else if (s[0] === 'thread') {
        assert.ok(expectedThreadMetrics.includes(m), m);
        expectedThreadMetrics = expectedThreadMetrics.filter((x) => x !== m);
      } else {
        assert.fail('unreachable');
      }
    }
    // All metrics have been found. Test is complete.
    if (expectedThreadMetrics.length === 0 &&
        expectedProcMetrics.length === 0) {
      process.exit();
    }
  }, 2));
}));

server.listen(0, '127.0.0.1', mustCall(() => {
  binding.setAddHooks(`tcp://127.0.0.1:${server.address().port}`);
  assert.strictEqual(binding.getStatus(), 'initializing');
}));

assert.strictEqual(binding.getStatus(), null);
