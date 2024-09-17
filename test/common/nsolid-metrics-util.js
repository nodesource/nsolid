'use strict';

require('../common');
const assert = require('assert');
const path = require('path');
const stringKeys = ['user', 'threadName', 'title'];
const numberKeys = [
  'threadId', 'timestamp', 'activeHandles', 'activeRequests', 'heapTotal',
  'totalHeapSizeExecutable', 'totalPhysicalSize', 'totalAvailableSize',
  'heapUsed', 'heapSizeLimit', 'mallocedMemory', 'externalMem',
  'peakMallocedMemory', 'numberOfNativeContexts', 'numberOfDetachedContexts',
  'gcCount', 'gcForcedCount', 'gcFullCount', 'gcMajorCount', 'gcDurUs99Ptile',
  'gcDurUsMedian', 'dnsCount', 'httpClientAbortCount', 'httpClientCount',
  'httpServerAbortCount', 'httpServerCount', 'dns99Ptile', 'dnsMedian',
  'httpClient99Ptile', 'httpClientMedian', 'httpServer99Ptile',
  'httpServerMedian', 'loopIdleTime', 'loopIterations', 'loopIterWithEvents',
  'eventsProcessed', 'eventsWaiting', 'providerDelay', 'processingDelay',
  'loopUtilization', 'res5s', 'res1m', 'res5m', 'res15m', 'loopTotalCount',
  'loopAvgTasks', 'loopEstimatedLag', 'loopIdlePercent', 'uptime',
  'systemUptime', 'freeMem', 'blockInputOpCount', 'blockOutputOpCount',
  'ctxSwitchInvoluntaryCount', 'ctxSwitchVoluntaryCount', 'ipcReceivedCount',
  'ipcSentCount', 'pageFaultHardCount', 'pageFaultSoftCount', 'signalCount',
  'swapCount', 'rss', 'load1m', 'load5m', 'load15m', 'cpuUserPercent',
  'cpuSystemPercent', 'cpuPercent', 'cpu', 'pipeServerCreatedCount',
  'pipeServerDestroyedCount', 'pipeSocketCreatedCount',
  'pipeSocketDestroyedCount', 'tcpServerCreatedCount',
  'tcpServerDestroyedCount', 'tcpSocketCreatedCount',
  'tcpSocketDestroyedCount', 'udpSocketCreatedCount',
  'udpSocketDestroyedCount', 'promiseCreatedCount',
  'promiseResolvedCount', 'fsHandlesOpenedCount', 'fsHandlesClosedCount'];

module.exports = { numberKeys, stringKeys, checkMetrics };

// Set expectStrings to true if we are only expecting the numberic entries
function checkMetrics(metrics, expectStrings) {
  numberKeys.forEach((key) => checkNumbericKey(key, metrics[key]));

  assert.ok(metrics.cpu === metrics.cpuPercent,
            `cpuPercent === cpu ${metrics.cpuPercent} <> ${metrics.cpu}`);

  const extraneousKeys = Object.keys(metrics).filter(
    (key) => numberKeys.indexOf(key) === -1 &&
      (expectStrings === false || stringKeys.indexOf(key) === -1));

  assert.strictEqual(extraneousKeys.length,
                     0,
                     `no extraneous keys [${extraneousKeys.join(', ')}]`);

  if (!expectStrings)
    return;

  stringKeys.forEach((key) => {
    assert.strictEqual(typeof metrics[key], 'string', `${key} is a string`);
  });

  assert.ok(path.basename(metrics.title),
            path.basename(process.execPath),
            `includes process title (${metrics.title} <> ` +
            `${path.basename(process.execPath)})`);
}

function checkNumbericKey(key, value) {
  assert.strictEqual(typeof value,
                     'number',
                     `${key} is a number [${value}]`);

  if ((/Count$/).test(key)) {
    assert.ok(Number.isInteger(value),
              `${key} is an integer [${value}]`);
  }
  if ((/^Percent$/).test(key)) {
    assert.ok(value >= 0, `${key} is a percent`);
  }
}
