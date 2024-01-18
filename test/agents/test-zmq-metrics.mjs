// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { threadId } from 'node:worker_threads';
import validators from 'internal/validators';
import { TestPlayground } from '../common/nsolid-zmq-agent/index.js';

const {
  validateArray,
  validateString,
  validateNumber,
  validateObject,
  validateUint32
} = validators;


// Data has this format:
// {
//   agentId: 'db60f4163efd1e00fe23fd480e279c00415d38ce',
//   requestId: '6ef826bc-c504-4ef2-a093-997fce309045',
//   command: 'metrics',
//   recorded: { seconds: 1704798405, nanoseconds: 620710478 },
//   duration: 0,
//   interval: 3000,
//   version: 4,
//   body: {
//     processMetrics: {
//       timestamp: 1704798405616,
//       uptime: 0,
//       systemUptime: 3761,
//       freeMem: 24968327168,
//       blockInputOpCount: 0,
//       blockOutputOpCount: 0,
//       ctxSwitchInvoluntaryCount: 0,
//       ctxSwitchVoluntaryCount: 39,
//       ipcReceivedCount: 0,
//       ipcSentCount: 0,
//       pageFaultHardCount: 0,
//       pageFaultSoftCount: 3429,
//       signalCount: 0,
//       swapCount: 0,
//       rss: 54542336,
//       load1m: 0.82,
//       load5m: 0.69,
//       load15m: 0.78,
//       cpuUserPercent: 50.021387,
//       cpuSystemPercent: 4.652745,
//       cpuPercent: 54.674132,
//       title: '/home/sgimeno/nodesource/nsolid/out/Release/nsolid',
//       user: 'sgimeno'
//     },
//     threadMetrics: [
//       {
//         threadId: 0,
//         timestamp: 1704798405615,
//         activeHandles: 2,
//         activeRequests: 0,
//         heapTotal: 4907008,
//         totalHeapSizeExecutable: 262144,
//         totalPhysicalSize: 4976640,
//         totalAvailableSize: 4341636488,
//         heapUsed: 4590920,
//         heapSizeLimit: 4345298944,
//         mallocedMemory: 360736,
//         externalMem: 1650226,
//         peakMallocedMemory: 572512,
//         numberOfNativeContexts: 1,
//         numberOfDetachedContexts: 0,
//         gcCount: 0,
//         gcForcedCount: 0,
//         gcFullCount: 0,
//         gcMajorCount: 0,
//         dnsCount: 0,
//         httpClientAbortCount: 0,
//         httpClientCount: 0,
//         httpServerAbortCount: 0,
//         httpServerCount: 0,
//         loopIdleTime: 19614540,
//         loopIterations: 1,
//         loopIterWithEvents: 1,
//         eventsProcessed: 1,
//         eventsWaiting: 1,
//         providerDelay: 8456048,
//         processingDelay: 0,
//         loopTotalCount: 1,
//         pipeServerCreatedCount: 0,
//         pipeServerDestroyedCount: 0,
//         pipeSocketCreatedCount: 1,
//         pipeSocketDestroyedCount: 0,
//         tcpServerCreatedCount: 0,
//         tcpServerDestroyedCount: 0,
//         tcpSocketCreatedCount: 0,
//         tcpSocketDestroyedCount: 0,
//         udpSocketCreatedCount: 0,
//         udpSocketDestroyedCount: 0,
//         promiseCreatedCount: 0,
//         promiseResolvedCount: 0,
//         fsHandlesOpenedCount: 0,
//         fsHandlesClosedCount: 0,
//         gcDurUs99Ptile: 0,
//         gcDurUsMedian: 0,
//         dns99Ptile: 0,
//         dnsMedian: 0,
//         httpClient99Ptile: 0,
//         httpClientMedian: 0,
//         httpServer99Ptile: 0,
//         httpServerMedian: 0,
//         loopUtilization: 0.137165,
//         res5s: 0.001691,
//         res1m: 0.000141,
//         res5m: 0.000028,
//         res15m: 0.000009,
//         loopAvgTasks: 0,
//         loopEstimatedLag: 0.0005,
//         loopIdlePercent: 86.283493,
//         threadName: ''
//       }
//     ]
//   },
//   time: 1704798405621,
//   timeNS: '1704798405620710478'
// }

function checkProcessMetrics(processMetrics) {
  validateObject(processMetrics, 'processMetrics');
  validateNumber(processMetrics.timestamp, 'processMetrics.timestamp');
  validateNumber(processMetrics.uptime, 'processMetrics.uptime');
  validateNumber(processMetrics.systemUptime, 'processMetrics.systemUptime');
  validateNumber(processMetrics.freeMem, 'processMetrics.freeMem');
  validateUint32(processMetrics.blockInputOpCount, 'processMetrics.blockInputOpCount');
  validateUint32(processMetrics.blockOutputOpCount, 'processMetrics.blockOutputOpCount');
  validateUint32(processMetrics.ctxSwitchInvoluntaryCount, 'processMetrics.ctxSwitchInvoluntaryCount');
  validateUint32(processMetrics.ctxSwitchVoluntaryCount, 'processMetrics.ctxSwitchVoluntaryCount');
  validateUint32(processMetrics.ipcReceivedCount, 'processMetrics.ipcReceivedCount');
  validateUint32(processMetrics.ipcSentCount, 'processMetrics.ipcSentCount');
  validateUint32(processMetrics.pageFaultHardCount, 'processMetrics.pageFaultHardCount');
  validateUint32(processMetrics.pageFaultSoftCount, 'processMetrics.pageFaultSoftCount');
  validateUint32(processMetrics.signalCount, 'processMetrics.signalCount');
  validateUint32(processMetrics.swapCount, 'processMetrics.swapCount');
  validateNumber(processMetrics.rss, 'processMetrics.rss');
  validateNumber(processMetrics.load1m, 'processMetrics.load1m');
  validateNumber(processMetrics.load5m, 'processMetrics.load5m');
  validateNumber(processMetrics.load15m, 'processMetrics.load15m');
  validateNumber(processMetrics.cpuUserPercent, 'processMetrics.cpuUserPercent');
  validateNumber(processMetrics.cpuSystemPercent, 'processMetrics.cpuSystemPercent');
  validateNumber(processMetrics.cpuPercent, 'processMetrics.cpuPercent');
  validateString(processMetrics.title, 'processMetrics.title');
  validateString(processMetrics.user, 'processMetrics.user');
}

function checkThreadMetrics(threadMetrics) {
  validateArray(threadMetrics, 'threadMetrics');
  for (const threadMetric of threadMetrics) {
    validateObject(threadMetric, 'threadMetric');
    validateUint32(threadMetric.threadId, 'threadMetric.threadId');
    validateNumber(threadMetric.timestamp, 'threadMetric.timestamp');
    validateUint32(threadMetric.activeHandles, 'threadMetric.activeHandles');
    validateUint32(threadMetric.activeRequests, 'threadMetric.activeRequests');
    validateNumber(threadMetric.heapTotal, 'threadMetric.heapTotal');
    validateNumber(threadMetric.totalHeapSizeExecutable, 'threadMetric.totalHeapSizeExecutable');
    validateNumber(threadMetric.totalPhysicalSize, 'threadMetric.totalPhysicalSize');
    validateNumber(threadMetric.totalAvailableSize, 'threadMetric.totalAvailableSize');
    validateNumber(threadMetric.heapUsed, 'threadMetric.heapUsed');
    validateNumber(threadMetric.heapSizeLimit, 'threadMetric.heapSizeLimit');
    validateNumber(threadMetric.mallocedMemory, 'threadMetric.mallocedMemory');
    validateNumber(threadMetric.externalMem, 'threadMetric.externalMem');
    validateNumber(threadMetric.peakMallocedMemory, 'threadMetric.peakMallocedMemory');
    validateUint32(threadMetric.numberOfNativeContexts, 'threadMetric.numberOfNativeContexts');
    validateUint32(threadMetric.numberOfDetachedContexts, 'threadMetric.numberOfDetachedContexts');
    validateUint32(threadMetric.gcCount, 'threadMetric.gcCount');
    validateUint32(threadMetric.gcForcedCount, 'threadMetric.gcForcedCount');
    validateUint32(threadMetric.gcFullCount, 'threadMetric.gcFullCount');
    validateUint32(threadMetric.gcMajorCount, 'threadMetric.gcMajorCount');
    validateUint32(threadMetric.dnsCount, 'threadMetric.dnsCount');
    validateUint32(threadMetric.httpClientAbortCount, 'threadMetric.httpClientAbortCount');
    validateUint32(threadMetric.httpClientCount, 'threadMetric.httpClientCount');
    validateUint32(threadMetric.httpServerAbortCount, 'threadMetric.httpServerAbortCount');
    validateUint32(threadMetric.httpServerCount, 'threadMetric.httpServerCount');
    validateNumber(threadMetric.loopIdleTime, 'threadMetric.loopIdleTime');
    validateUint32(threadMetric.loopIterations, 'threadMetric.loopIterations');
    validateUint32(threadMetric.loopIterWithEvents, 'threadMetric.loopIterWithEvents');
    validateUint32(threadMetric.eventsProcessed, 'threadMetric.eventsProcessed');
    validateUint32(threadMetric.eventsWaiting, 'threadMetric.eventsWaiting');
    validateNumber(threadMetric.providerDelay, 'threadMetric.providerDelay');
    validateNumber(threadMetric.processingDelay, 'threadMetric.processingDelay');
    validateUint32(threadMetric.loopTotalCount, 'threadMetric.loopTotalCount');
    validateUint32(threadMetric.pipeServerCreatedCount, 'threadMetric.pipeServerCreatedCount');
    validateUint32(threadMetric.pipeServerDestroyedCount, 'threadMetric.pipeServerDestroyedCount');
    validateUint32(threadMetric.pipeSocketCreatedCount, 'threadMetric.pipeSocketCreatedCount');
    validateUint32(threadMetric.pipeSocketDestroyedCount, 'threadMetric.pipeSocketDestroyedCount');
    validateUint32(threadMetric.tcpServerCreatedCount, 'threadMetric.tcpServerCreatedCount');
    validateUint32(threadMetric.tcpServerDestroyedCount, 'threadMetric.tcpServerDestroyedCount');
    validateUint32(threadMetric.tcpSocketCreatedCount, 'threadMetric.tcpSocketCreatedCount');
    validateUint32(threadMetric.tcpSocketDestroyedCount, 'threadMetric.tcpSocketDestroyedCount');
    validateUint32(threadMetric.udpSocketCreatedCount, 'threadMetric.udpSocketCreatedCount');
    validateUint32(threadMetric.udpSocketDestroyedCount, 'threadMetric.udpSocketDestroyedCount');
    validateUint32(threadMetric.promiseCreatedCount, 'threadMetric.promiseCreatedCount');
    validateUint32(threadMetric.promiseResolvedCount, 'threadMetric.promiseResolvedCount');
    validateUint32(threadMetric.fsHandlesOpenedCount, 'threadMetric.fsHandlesOpenedCount');
    validateUint32(threadMetric.fsHandlesClosedCount, 'threadMetric.fsHandlesClosedCount');
    validateNumber(threadMetric.gcDurUs99Ptile, 'threadMetric.gcDurUs99Ptile');
    validateNumber(threadMetric.gcDurUsMedian, 'threadMetric.gcDurUsMedian');
    validateNumber(threadMetric.dns99Ptile, 'threadMetric.dns99Ptile');
    validateNumber(threadMetric.dnsMedian, 'threadMetric.dnsMedian');
    validateNumber(threadMetric.httpClient99Ptile, 'threadMetric.httpClient99Ptile');
    validateNumber(threadMetric.httpClientMedian, 'threadMetric.httpClientMedian');
    validateNumber(threadMetric.httpServer99Ptile, 'threadMetric.httpServer99Ptile');
    validateNumber(threadMetric.httpServerMedian, 'threadMetric.httpServerMedian');
    validateNumber(threadMetric.loopUtilization, 'threadMetric.loopUtilization');
    validateNumber(threadMetric.res5s, 'threadMetric.res5s');
    validateNumber(threadMetric.res1m, 'threadMetric.res1m');
    validateNumber(threadMetric.res5m, 'threadMetric.res5m');
    validateNumber(threadMetric.res15m, 'threadMetric.res15m');
    validateNumber(threadMetric.loopAvgTasks, 'threadMetric.loopAvgTasks');
    validateNumber(threadMetric.loopEstimatedLag, 'threadMetric.loopEstimatedLag');
    validateNumber(threadMetric.loopIdlePercent, 'threadMetric.loopIdlePercent');
    validateString(threadMetric.threadName, 'threadMetric.threadName');
  }
}


function checkMetricsData(metrics, requestId, agentId, threads) {
  console.dir(metrics, { depth: null });
  assert.strictEqual(metrics.requestId, requestId);
  assert.strictEqual(metrics.agentId, agentId);
  assert.strictEqual(metrics.command, 'metrics');
  // From here check at least that all the fields are present
  assert.ok(metrics.recorded);
  assert.ok(metrics.recorded.seconds);
  assert.ok(metrics.recorded.nanoseconds);
  assert.ok(metrics.duration != null);
  assert.ok(metrics.interval);
  assert.ok(metrics.version);
  assert.ok(metrics.body);
  assert.ok(metrics.time);
  // also the body fields
  assert.ok(metrics.body.processMetrics);
  assert.ok(metrics.body.threadMetrics);

  assert.strictEqual(metrics.body.threadMetrics.length, threads.length);

  // Validate processMetrics and threadMetrics
  checkProcessMetrics(metrics.body.processMetrics);
  checkThreadMetrics(metrics.body.threadMetrics);
}

const tests = [];

tests.push({
  name: 'should provide the correct values with only the main thread',
  test: async (playground) => {
    return new Promise((resolve) => {
      const opts = {
        opts: { env: { NSOLID_INTERVAL: 100 } }
      };
      playground.bootstrap(opts, mustSucceed(async (agentId) => {
        const workers = await playground.client.workers();
        assert.strictEqual(workers.length, 0);
        // Check that threadName is correctly set and encoded
        assert.ok(await playground.client.threadName(threadId, 'abc\\'));
        setTimeout(() => {
          const requestId = playground.zmqAgentBus.agentMetricsRequest(agentId, mustSucceed((metrics) => {
            checkMetricsData(metrics, requestId, agentId, [ 0, ...workers ]);
            assert.strictEqual(metrics.body.threadMetrics[0].threadName, 'abc\\');
            resolve();
          }));
        }, 200);
      }));
    });
  }
});

tests.push({
  name: 'should provide the correct values with some workers',
  test: async (playground) => {
    return new Promise((resolve) => {
      const opts = {
        args: [ '-w', 2 ],
        opts: { env: { NSOLID_INTERVAL: 200 } }
      };

      playground.bootstrap(opts, mustSucceed(async (agentId) => {
        const workers = await playground.client.workers();
        assert.strictEqual(workers.length, 2);
        // Check that threadName is correctly set and encoded
        assert.ok(await playground.client.threadName(workers[0], 'abc\\'));
        setTimeout(() => {
          const requestId = playground.zmqAgentBus.agentMetricsRequest(agentId, mustSucceed((metrics) => {
            checkMetricsData(metrics, requestId, agentId, [ 0, ...workers ]);
            // Get the threadMetric element from thread with id workers[0]
            const threadMetrics = metrics.body.threadMetrics.find((threadMetric) => {
              return threadMetric.threadId === workers[0];
            });
            assert.strictEqual(threadMetrics.threadName, 'abc\\');
            resolve();
          }));
        }, 400);
      }));
    });
  }
});

const config = {
  commandBindAddr: 'tcp://*:9001',
  dataBindAddr: 'tcp://*:9002',
  bulkBindAddr: 'tcp://*:9003',
  HWM: 0,
  bulkHWM: 0,
  commandTimeoutMilliseconds: 5000
};


const playground = new TestPlayground(config);
await playground.startServer();

for (const { name, test } of tests) {
  console.log(`metrics command ${name}`);
  await test(playground);
  await playground.stopClient();
}

playground.stopServer();
