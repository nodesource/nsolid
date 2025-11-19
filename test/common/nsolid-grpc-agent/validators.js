'use strict';

const assert = require('node:assert');
const {
  validateArray,
  validateNumber,
  validateObject,
  validateString,
} = require('internal/validators');

// Expected process metrics (same across all tests)
const expectedProcMetrics = [
  [ 'uptime', 's', 'asInt', 'sum' ],
  [ 'systemUptime', 's', 'asInt', 'sum' ],
  [ 'freeMem', 'byte', 'asInt', 'gauge' ],
  [ 'blockInputOpCount', '', 'asInt', 'sum' ],
  [ 'blockOutputOpCount', '', 'asInt', 'sum' ],
  [ 'ctxSwitchInvoluntaryCount', '', 'asInt', 'sum' ],
  [ 'ctxSwitchVoluntaryCount', '', 'asInt', 'sum' ],
  [ 'ipcReceivedCount', '', 'asInt', 'sum' ],
  [ 'ipcSentCount', '', 'asInt', 'sum' ],
  [ 'pageFaultHardCount', '', 'asInt', 'sum' ],
  [ 'pageFaultSoftCount', '', 'asInt', 'sum' ],
  [ 'signalCount', '', 'asInt', 'sum' ],
  [ 'swapCount', '', 'asInt', 'sum' ],
  [ 'rss', 'byte', 'asInt', 'gauge' ],
  [ 'load1m', '', 'asDouble', 'gauge' ],
  [ 'load5m', '', 'asDouble', 'gauge' ],
  [ 'load15m', '', 'asDouble', 'gauge' ],
  [ 'cpuUserPercent', '', 'asDouble', 'gauge' ],
  [ 'cpuSystemPercent', '', 'asDouble', 'gauge' ],
  [ 'cpuPercent', '', 'asDouble', 'gauge' ],
];

// Expected thread metrics (same across all tests)
const expectedThreadMetrics = [
  ['activeHandles', '', 'asInt', 'gauge'],
  ['activeRequests', '', 'asInt', 'gauge'],
  ['heapTotal', 'byte', 'asInt', 'gauge'],
  ['totalHeapSizeExecutable', 'byte', 'asInt', 'gauge'],
  ['totalPhysicalSize', 'byte', 'asInt', 'gauge'],
  ['totalAvailableSize', 'byte', 'asInt', 'gauge'],
  ['heapUsed', 'byte', 'asInt', 'gauge'],
  ['heapSizeLimit', 'byte', 'asInt', 'gauge'],
  ['mallocedMemory', 'byte', 'asInt', 'gauge'],
  ['externalMem', 'byte', 'asInt', 'gauge'],
  ['peakMallocedMemory', 'byte', 'asInt', 'gauge'],
  ['numberOfNativeContexts', '', 'asInt', 'gauge'],
  ['numberOfDetachedContexts', '', 'asInt', 'gauge'],
  ['gcCount', '', 'asInt', 'sum'],
  ['gcForcedCount', '', 'asInt', 'sum'],
  ['gcFullCount', '', 'asInt', 'sum'],
  ['gcMajorCount', '', 'asInt', 'sum'],
  ['dnsCount', '', 'asInt', 'sum'],
  ['httpClientAbortCount', '', 'asInt', 'sum'],
  ['httpClientCount', '', 'asInt', 'sum'],
  ['httpServerAbortCount', '', 'asInt', 'sum'],
  ['httpServerCount', '', 'asInt', 'sum'],
  ['loopIdleTime', 'ms', 'asInt', 'gauge'],
  ['loopIterations', '', 'asInt', 'sum'],
  ['loopIterWithEvents', '', 'asInt', 'sum'],
  ['eventsProcessed', '', 'asInt', 'sum'],
  ['eventsWaiting', '', 'asInt', 'gauge'],
  ['providerDelay', 'ms', 'asInt', 'gauge'],
  ['processingDelay', 'ms', 'asInt', 'gauge'],
  ['loopTotalCount', '', 'asInt', 'sum'],
  ['pipeServerCreatedCount', '', 'asInt', 'sum'],
  ['pipeServerDestroyedCount', '', 'asInt', 'sum'],
  ['pipeSocketCreatedCount', '', 'asInt', 'sum'],
  ['pipeSocketDestroyedCount', '', 'asInt', 'sum'],
  ['tcpServerCreatedCount', '', 'asInt', 'sum'],
  ['tcpServerDestroyedCount', '', 'asInt', 'sum'],
  ['tcpSocketCreatedCount', '', 'asInt', 'sum'],
  ['tcpSocketDestroyedCount', '', 'asInt', 'sum'],
  ['udpSocketCreatedCount', '', 'asInt', 'sum'],
  ['udpSocketDestroyedCount', '', 'asInt', 'sum'],
  ['promiseCreatedCount', '', 'asInt', 'sum'],
  ['promiseResolvedCount', '', 'asInt', 'sum'],
  ['fsHandlesOpenedCount', '', 'asInt', 'sum'],
  ['fsHandlesClosedCount', '', 'asInt', 'sum'],
  ['loopUtilization', '', 'asDouble', 'gauge'],
  ['res5s', '', 'asDouble', 'gauge'],
  ['res1m', '', 'asDouble', 'gauge'],
  ['res5m', '', 'asDouble', 'gauge'],
  ['res15m', '', 'asDouble', 'gauge'],
  ['loopAvgTasks', '', 'asDouble', 'gauge'],
  ['loopEstimatedLag', 'ms', 'asDouble', 'gauge'],
  ['loopIdlePercent', '', 'asDouble', 'gauge'],
  ['gcDurUs', 'us', 'asDouble', 'summary'],
  ['dns', 'ms', 'asDouble', 'summary'],
  ['httpClient', 'ms', 'asDouble', 'summary'],
  ['httpServer', 'ms', 'asDouble', 'summary'],
];

function hasThreadAttributes(metric) {
  return metric.gauge?.dataPoints?.[0]?.attributes?.some((attr) => attr.key === 'thread.id') ||
         metric.sum?.dataPoints?.[0]?.attributes?.some((attr) => attr.key === 'thread.id') ||
         metric.summary?.dataPoints?.[0]?.attributes?.some((attr) => attr.key === 'thread.id');
}

function checkResource(resource, agentId, config, metrics) {
  validateArray(resource.attributes, 'attributes');

  const expectedAttributes = {
    'telemetry.sdk.version': process.versions.opentelemetry,
    'telemetry.sdk.language': 'cpp',
    'telemetry.sdk.name': 'opentelemetry',
    'service.instance.id': agentId,
    'service.name': config.app,
    'service.version': config.appVersion,
  };

  if (metrics) {
    expectedAttributes['process.title'] = metrics.title;
    expectedAttributes['process.owner'] = metrics.user;
  }

  assert.strictEqual(resource.attributes.length, Object.keys(expectedAttributes).length);

  resource.attributes.forEach((attribute) => {
    assert.strictEqual(attribute.value.stringValue, expectedAttributes[attribute.key]);
    delete expectedAttributes[attribute.key];
  });

  assert.strictEqual(Object.keys(expectedAttributes).length, 0);
}

function checkExitData(data, metadata, agentId, expectedData) {
  console.dir(data, { depth: null });
  validateString(data.common.requestId, 'common.requestId');
  assert.strictEqual(data.common.command, 'exit');
  // From here check at least that all the fields are present
  validateObject(data.common.recorded, 'recorded');
  const recSeconds = BigInt(data.common.recorded.seconds);
  assert.ok(recSeconds);
  const recNanoSecs = BigInt(data.common.recorded.nanoseconds);
  assert.ok(recNanoSecs);
  validateObject(data.body, 'body');
  // also the body fields
  assert.strictEqual(data.body.code, expectedData.code);
  assert.strictEqual(data.body.profile, expectedData.profile);
  if (expectedData.error === null) {
    assert.strictEqual(data.body.error, null);
  } else {
    assert.ok(data.body.error);
    assert.strictEqual(data.body.error.message, expectedData.error.message);
    validateString(data.body.error.stack, 'error.stack');
  }

  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

function checkOTLPMetricsData(resourceMetrics,
                              agentId,
                              nsolidConfig,
                              nsolidMetrics,
                              expectedBatchSize,
                              isThreadMetrics,
                              expectFlushedBatch = false,
                              expectFlushRange = null) {
  validateArray(resourceMetrics, 'resourceMetrics');
  assert.strictEqual(resourceMetrics.length, 1);
  checkResource(resourceMetrics[0].resource, agentId, nsolidConfig, nsolidMetrics);

  const scopeMetrics = resourceMetrics[0].scopeMetrics;
  validateArray(scopeMetrics, 'scopeMetrics');
  assert.strictEqual(scopeMetrics.length, 1);
  assert.strictEqual(scopeMetrics[0].scope.name, 'nsolid');
  assert.strictEqual(scopeMetrics[0].scope.version,
                     `${process.version}+nsv${process.versions.nsolid}`);

  const metrics = scopeMetrics[0].metrics;

  if (isThreadMetrics) {
    console.log(`Checking thread metrics (${metrics.length} metrics)`);
    // Check thread metrics
    for (const expectedMetric of expectedThreadMetrics) {
      const [ name, unit, type, aggregation ] = expectedMetric;
      const metric = metrics.find((m) => m.name === name);
      if (!metric) {
        console.log(`Warning: Thread metric ${name} not found in this export`);
        continue;
      }
      assert.strictEqual(metric.unit, unit);
      assert.strictEqual(metric.data, aggregation);
      const dataPoints = metric[aggregation].dataPoints;
      validateArray(dataPoints, `${name}.dataPoints`);
      assert.ok(dataPoints.length > 0, `Expected at least one datapoint for ${name}`);

      console.log(`Thread metric ${name}: ${dataPoints.length} datapoints (expected: ${expectFlushedBatch ? 'flushed range' : expectedBatchSize})`);

      // Thread metrics should have exactly expectedBatchSize datapoints, or a range if flushed
      if (expectFlushedBatch) {
        const min = expectFlushRange ? expectFlushRange[0] : 3;
        const max = expectFlushRange ? expectFlushRange[1] : 7;
        assert.ok(dataPoints.length >= min && dataPoints.length <= max,
                  `Thread metric ${name} should have ${min}-${max} datapoints when flushed, but got ${dataPoints.length}`);
      } else {
        assert.strictEqual(dataPoints.length, expectedBatchSize,
                           `Thread metric ${name} should have exactly ${expectedBatchSize} datapoints, but got ${dataPoints.length}`);
      }

      const threadIds = new Set();
      for (const dataPoint of dataPoints) {
        validateArray(dataPoint.attributes, `${name}.attributes`);
        const threadIdAttr = dataPoint.attributes.find((a) => a.key === 'thread.id');
        assert.ok(threadIdAttr, `thread.id attribute missing for ${name}`);
        threadIds.add(threadIdAttr.value.intValue);
        const threadNameAttr = dataPoint.attributes.find((a) => a.key === 'thread.name');
        assert.ok(threadNameAttr, `thread.name attribute missing for ${name}`);
        if (metric.data === 'summary') {
          validateArray(dataPoint.quantileValues, `${name}.quantileValues`);
          assert.strictEqual(dataPoint.quantileValues.length, 2);
          assert.strictEqual(dataPoint.quantileValues[0].quantile, 0.99);
          assert.strictEqual(dataPoint.quantileValues[1].quantile, 0.5);
          if (dataPoint.quantileValues[0].value) {
            validateNumber(dataPoint.quantileValues[0].value, `${name}.quantileValues[0].value`);
          }
          if (dataPoint.quantileValues[1].value) {
            validateNumber(dataPoint.quantileValues[1].value, `${name}.quantileValues[1].value`);
          }
        } else {
          assert.strictEqual(dataPoint.value, expectedMetric[2]);
          if (type === 'asInt') {
            validateNumber(parseInt(dataPoint[type], 10), `${name}.${type}`);
          } else {  // asDouble
            validateNumber(dataPoint[type], `${name}.${type}`);
          }
        }
      }
      assert.ok(threadIds.size > 0, `No thread IDs recorded for ${name}`);
      assert.ok(threadIds.has('0'), `Missing main thread datapoint for ${name}`);
    }
  } else {
    console.log(`Checking process metrics (${metrics.length} metrics)`);
    // Check process metrics
    for (const expectedMetric of expectedProcMetrics) {
      const metric = metrics.find((m) => m.name === expectedMetric[0]);
      assert.ok(metric, `Expected process metric ${expectedMetric[0]} not found`);
      assert.strictEqual(metric.unit, expectedMetric[1]);
      assert.strictEqual(metric.data, expectedMetric[3]);
      const dataPoints = metric[expectedMetric[3]].dataPoints;
      validateArray(dataPoints, `${expectedMetric[0]}.dataPoints`);

      console.log(`Process metric ${expectedMetric[0]}: ${dataPoints.length} datapoints (expected: ${expectFlushedBatch ? 'flushed range' : expectedBatchSize})`);

      // Process metrics should have exactly expectedBatchSize datapoints, or a range if flushed
      if (expectFlushedBatch) {
        const min = expectFlushRange ? expectFlushRange[0] : 3;
        const max = expectFlushRange ? expectFlushRange[1] : 7;
        assert.ok(dataPoints.length >= min && dataPoints.length <= max,
                  `Process metric ${expectedMetric[0]} should have ${min}-${max} datapoints when flushed, but got ${dataPoints.length}`);
      } else {
        assert.strictEqual(dataPoints.length, expectedBatchSize,
                           `Process metric ${expectedMetric[0]} should have exactly ${expectedBatchSize} datapoints, but got ${dataPoints.length}`);
      }

      const dataPoint = dataPoints[0];
      assert.strictEqual(dataPoint.attributes.length, 0);
      assert.strictEqual(dataPoint.value, expectedMetric[2]);
    }
  }
}

module.exports = {
  checkExitData,
  checkResource,
  checkOTLPMetricsData,
  hasThreadAttributes,
};
