// Flags: --expose-internals
import { mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import {
  checkResource,
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';
import validators from 'internal/validators';

const {
  validateArray,
  validateNumber,
} = validators;

const expectedProcMetrics = [
  [ 'uptime', 's', 'asInt', 'sum' ],
  [ 'systemUptime', 's', 'asInt', 'sum' ],
  [ 'freeMem', 'byte', 'asInt', 'gauge' ],
  [ 'totalMem', 'byte', 'asInt', 'gauge' ],
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
  ['loopIdleTime', 'ns', 'asInt', 'gauge'],
  ['loopIterations', '', 'asInt', 'sum'],
  ['loopIterWithEvents', '', 'asInt', 'sum'],
  ['eventsProcessed', '', 'asInt', 'sum'],
  ['eventsWaiting', '', 'asInt', 'gauge'],
  ['providerDelay', 'ns', 'asInt', 'gauge'],
  ['processingDelay', 'ns', 'asInt', 'gauge'],
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

function checkScopeMetrics(scopeMetrics) {
  validateArray(scopeMetrics, 'scopeMetrics');
  assert.strictEqual(scopeMetrics.length, 1);
  assert.strictEqual(scopeMetrics[0].scope.name, 'nsolid');
  assert.strictEqual(scopeMetrics[0].scope.version,
                     `${process.version}+nsv${process.versions.nsolid}`);

  const metrics = scopeMetrics[0].metrics;
  // Check that expectedProcMetrics and expectedThreadMetrics are present
  // This is an example of a proc metric:
  // {
  //   metadata: [],
  //   name: 'freeMem',
  //   description: '',
  //   unit: 'byte',
  //   gauge: {
  //     dataPoints: [
  //       {
  //         exemplars: [],
  //         attributes: [],
  //         startTimeUnixNano: '1729258760942892000',
  //         timeUnixNano: '1729258761188000000',
  //         flags: 0,
  //         asInt: '13867581440',
  //         value: 'asInt'
  //       }
  //     ]
  //   },
  //   data: 'gauge'
  // },
  // This is an example of a thread metric:
  // {
  //   metadata: [],
  //   name: 'totalPhysicalSize',
  //   description: '',
  //   unit: 'byte',
  //   gauge: {
  //     dataPoints: [
  //       {
  //         exemplars: [],
  //         attributes: [
  //           {
  //             key: 'thread.id',
  //             value: { intValue: '0', value: 'intValue' }
  //           },
  //           {
  //             key: 'thread.name',
  //             value: { stringValue: '', value: 'stringValue' }
  //           }
  //         ],
  //         startTimeUnixNano: '1729258760942892000',
  //         timeUnixNano: '1729258761189000000',
  //         flags: 0,
  //         asInt: '6811648',
  //         value: 'asInt'
  //       }
  //     ]
  //   },
  //   data: 'gauge'
  // },
  // Lets' start with checking that all expectedProcMetrics are present
  for (const expectedMetric of expectedProcMetrics) {
    const metric = metrics.find((m) => m.name === expectedMetric[0]);
    assert.ok(metric, `Expected metric ${expectedMetric[0]} not found`);
    assert.strictEqual(metric.unit, expectedMetric[1]);
    assert.strictEqual(metric.data, expectedMetric[3]);
    const dataPoints = metric[expectedMetric[3]].dataPoints;
    assert.strictEqual(dataPoints.length, 1);
    const dataPoint = dataPoints[0];
    assert.strictEqual(dataPoint.attributes.length, 0);
    assert.strictEqual(dataPoint.value, expectedMetric[2]);
  }

  // Now check that all expectedThreadMetrics are present
  for (const expectedMetric of expectedThreadMetrics) {
    const [ name, unit, type, aggregation ] = expectedMetric;
    const metric = metrics.find((m) => m.name === name);
    assert.ok(metric, `Expected metric ${name} not found`);
    assert.strictEqual(metric.unit, unit);
    assert.strictEqual(metric.data, aggregation);
    const dataPoints = metric[aggregation].dataPoints;
    assert.ok(dataPoints.length > 0);
    for (const dataPoint of dataPoints) {
      assert.strictEqual(dataPoint.attributes.length, 2);
      const threadIdAttr = dataPoint.attributes.find((a) => a.key === 'thread.id');
      assert.ok(threadIdAttr);
      validateNumber(parseInt(threadIdAttr.value.intValue, 10), 'thread.id');
      const threadNameAttr = dataPoint.attributes.find((a) => a.key === 'thread.name');
      assert.ok(threadNameAttr);
      assert.strictEqual(typeof threadNameAttr.value.stringValue, 'string');
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

        assert.ok(dataPoint.quantileValues[0].value >= dataPoint.quantileValues[1].value, `p99 ${name} should be >= p50 ${name}`);
      } else {
        assert.strictEqual(dataPoint.value, expectedMetric[2]);
        if (type === 'asInt') {
          validateNumber(parseInt(dataPoint[type], 10), `${name}.${type}`);
        } else {  // asDouble
          validateNumber(dataPoint[type], `${name}.${type}`);
        }
      }
    }
  }
}

function checkMetricsData(msg,
                          metadata,
                          requestId,
                          agentId,
                          nsolidConfig,
                          nsolidMetrics,
                          nsolidInfo) {
  const metrics = msg;
  assert.strictEqual(metrics.common.requestId, requestId);
  assert.strictEqual(metrics.common.command, 'metrics');
  // From here check at least that all the fields are present
  assert.ok(metrics.common.recorded);
  assert.ok(metrics.common.recorded.seconds);
  assert.ok(metrics.common.recorded.nanoseconds);
  assert.ok(metrics.body);

  // also the body fields
  const resourceMetrics = metrics.body.resourceMetrics;
  validateArray(resourceMetrics, 'resourceMetrics');
  assert.strictEqual(resourceMetrics.length, 1);
  checkResource(resourceMetrics[0].resource,
                agentId,
                nsolidConfig,
                nsolidMetrics,
                nsolidInfo);
  checkScopeMetrics(resourceMetrics[0].scopeMetrics);
}

async function runTest({ getEnv }) {
  const hasThreadSnapshot = (exportedMetrics, threadId) => {
    const nsolidMetrics = exportedMetrics.resourceMetrics[0]
      .scopeMetrics.find((scope) => scope.scope.name === 'nsolid');
    return nsolidMetrics?.metrics.some((metric) =>
      metric[metric.data]?.dataPoints?.some((point) =>
        point.attributes.some((attr) =>
          attr.key === 'thread.id' &&
          attr.value.intValue === String(threadId)))) ?? false;
  };
  return new Promise((resolve) => {
    const grpcServer = new GRPCServer();
    grpcServer.start(mustSucceed(async (port) => {
      console.log('GRPC server started', port);
      const env = getEnv(port);
      const opts = {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env,
      };
      const child = new TestClient(['-t', 'http', '-w', '2'], opts);
      const agentId = await child.id();
      const config = await child.config({ app: 'my_app_name' });
      const [workerThreadId, exitingWorkerThreadId] = await child.workers();
      assert.ok(workerThreadId);
      assert.ok(exitingWorkerThreadId);
      const unsupportedMetrics = await child.unsupportedMetrics();
      assert.strictEqual(unsupportedMetrics.length, 2);
      assert.deepStrictEqual(unsupportedMetrics, [ null, null ]);

      const workerPoints = new Map();
      let workerCounterUnit;
      let workerCounterDescription;
      let delayedObservableValue;
      let afterRejectionObservableValue;
      const providerScopes = new Map();
      const onMetrics = mustCallAtLeast(async (exportedMetrics) => {
        const scopeMetrics = exportedMetrics.resourceMetrics[0].scopeMetrics;
        assert.ok(!(hasThreadSnapshot(exportedMetrics, 0) &&
          hasThreadSnapshot(exportedMetrics, workerThreadId)),
                  'providers must be exported in separate batches');
        for (const threadId of [ 0, workerThreadId ]) {
          if (hasThreadSnapshot(exportedMetrics, threadId)) {
            providerScopes.set(threadId, scopeMetrics);
          }
        }
        const testMeter = providerScopes.get(0)?.find(
          (scope) => scope.scope.name === 'test' &&
            scope.scope.version === '1.0');
        const workerMeter = providerScopes.get(workerThreadId)?.find(
          (scope) => scope.scope.name === 'test' &&
            scope.scope.version === '1.0');
        const currentMeter = scopeMetrics.find((scope) =>
          scope.scope.name === 'test' && scope.scope.version === '1.0');
        const workerCounter = currentMeter?.metrics.find(
          (metric) => metric.name === 'worker-requests');
        if (workerCounter) {
          workerCounterUnit = workerCounter.unit;
          workerCounterDescription = workerCounter.description;
          for (const point of workerCounter.sum.dataPoints) {
            const threadId = point.attributes.find(
              (attr) => attr.key === 'thread.id').value.intValue;
            workerPoints.set(threadId, point.asDouble);
          }
        }
        const delayedObservable = testMeter?.metrics.find(
          (metric) => metric.name === 'observed-async-value');
        if (delayedObservable?.gauge.dataPoints.length > 0) {
          delayedObservableValue = delayedObservable.gauge.dataPoints[0]
            .asDouble;
        }
        const afterRejectionObservable = testMeter?.metrics.find(
          (metric) => metric.name === 'observed-async-failure');
        if (afterRejectionObservable?.gauge.dataPoints.length > 0) {
          afterRejectionObservableValue = afterRejectionObservable
            .gauge.dataPoints[0].asDouble;
        }
        const otherMeter = providerScopes.get(0)?.find(
          (scope) => scope.scope.name === 'other' &&
            scope.scope.version === '1.0');
        const externalMeter = providerScopes.get(0)?.find(
          (scope) => scope.scope.name === 'external-api' &&
            scope.scope.version === '1.0');
        const externalCounter = externalMeter?.metrics.find(
          (metric) => metric.name === 'external-api-requests');
        const externalBatchGauge = externalMeter?.metrics.find(
          (metric) => metric.name === 'external-batch-gauge');
        const externalBatchCounter = externalMeter?.metrics.find(
          (metric) => metric.name === 'external-batch-counter');
        if (!testMeter || !workerMeter || !otherMeter || !externalMeter ||
            !externalCounter || externalCounter.sum.dataPoints[0]?.asDouble !== 3 ||
            externalBatchGauge?.gauge.dataPoints[0]?.asDouble !== 42 ||
            externalBatchCounter?.sum.dataPoints[0]?.asDouble !== 7 ||
            externalMeter.schemaUrl !==
              'https://example.com/schema/metrics' ||
            !workerPoints.has('0') ||
            !workerPoints.has(String(workerThreadId)) ||
            !workerMeter.metrics.some((metric) =>
              metric.name === 'observed-temperature') ||
            delayedObservableValue !== 42 ||
            afterRejectionObservableValue !== 99) {
          grpcServer.once('metrics', onMetrics);
          return;
        }

        const counters = testMeter.metrics.filter(
          (metric) => metric.name === 'requests');
        assert.strictEqual(counters.length, 1);
        const customCounter = counters[0];
        assert.strictEqual(customCounter.data, 'sum');
        assert.strictEqual(customCounter.unit, 'By');
        assert.strictEqual(customCounter.description, 'Bytes sent');
        assert.strictEqual(customCounter.sum.dataPoints.length, 2);
        const pointsByStatus = new Map(customCounter.sum.dataPoints.map(
          (point) => [
            point.attributes.find((attr) => attr.key === 'status')
              .value.intValue,
            point,
          ]));
        assert.strictEqual(pointsByStatus.get('200').asDouble, 5);
        assert.strictEqual(pointsByStatus.get('500').asDouble, 7);
        for (const point of customCounter.sum.dataPoints) {
          assert.strictEqual(point.attributes.length, 5);
          assert.ok(!point.attributes.some((attr) =>
            attr.key === 'thread.id' || attr.key === 'thread.name' ||
            attr.key === 'service.instance.id'));
          assert.strictEqual(point.attributes.find(
            (attr) => attr.key === 'route').value.stringValue, '/api/users');
          assert.deepStrictEqual(point.attributes.find(
            (attr) => attr.key === 'stages').value.arrayValue.values.map(
            (value) => value.stringValue), [ 'received', 'stored' ]);
          assert.deepStrictEqual(point.attributes.find(
            (attr) => attr.key === 'flags').value.arrayValue.values.map(
            (value) => value.boolValue), [ true, false ]);
          assert.deepStrictEqual(point.attributes.find(
            (attr) => attr.key === 'values').value.arrayValue.values.map(
            (value) => value.doubleValue), [ 1, 2 ]);
        }
        const histogram = testMeter.metrics.find(
          (metric) => metric.name === 'request-duration');
        assert.ok(histogram);
        assert.strictEqual(histogram.data, 'histogram');
        assert.strictEqual(histogram.unit, 'ms');
        assert.strictEqual(histogram.description, 'Request duration');
        assert.strictEqual(histogram.histogram.dataPoints.length, 1);
        const histogramPoint = histogram.histogram.dataPoints[0];
        assert.strictEqual(histogramPoint.count, '4');
        assert.strictEqual(histogramPoint.sum, 1e300);
        assert.strictEqual(histogramPoint.min, -1e-300);
        assert.strictEqual(histogramPoint.max, 1e300);
        assert.deepStrictEqual(histogramPoint.explicitBounds,
                               [ 0, 5, 10, 25, 50, 75, 100, 250, 500,
                                 750, 1000, 2500, 5000, 7500, 10000 ]);
        assert.strictEqual(histogramPoint.bucketCounts.reduce(
          (sum, count) => sum + Number(count), 0), 4);
        const zeroHistogram = testMeter.metrics.find(
          (metric) => metric.name === 'zero-histogram');
        assert.ok(zeroHistogram);
        const zeroPoint = zeroHistogram.histogram.dataPoints[0];
        assert.strictEqual(zeroPoint.count, '1');
        assert.strictEqual(zeroPoint.sum, 0);
        assert.strictEqual(zeroPoint.min, 0);
        assert.strictEqual(zeroPoint.max, 0);
        assert.strictEqual(zeroPoint.bucketCounts.reduce(
          (sum, count) => sum + Number(count), 0), 1);
        const fallbackHistogram = testMeter.metrics.find(
          (metric) => metric.name === 'invalid-histogram');
        const fallbackPoint = fallbackHistogram.histogram.dataPoints[0];
        assert.deepStrictEqual(fallbackPoint.explicitBounds,
                               zeroPoint.explicitBounds);
        assert.strictEqual(fallbackPoint.count, '1');
        assert.strictEqual(fallbackPoint.sum, 0);
        const statusHistogram = testMeter.metrics.find(
          (metric) => metric.name === 'histogram-status');
        assert.strictEqual(
          statusHistogram.histogram.dataPoints.length, 2);
        const histogramByStatus = new Map(
          statusHistogram.histogram.dataPoints.map((point) => [
            point.attributes.find((attr) => attr.key === 'status')
              .value.intValue,
            point.sum,
          ]));
        assert.strictEqual(histogramByStatus.get('200'), 3);
        assert.strictEqual(histogramByStatus.get('500'), 8);
        const validationHistogram = testMeter.metrics.find(
          (metric) => metric.name === 'validation-histogram');
        const validationPoint =
          validationHistogram.histogram.dataPoints[0];
        assert.strictEqual(validationPoint.count, '2');
        assert.strictEqual(validationPoint.sum, 0);
        assert.strictEqual(validationPoint.min, -Number.MAX_VALUE);
        assert.strictEqual(validationPoint.max, Number.MAX_VALUE);
        const advisedHistogram = testMeter.metrics.find(
          (metric) => metric.name === 'advised-histogram');
        assert.deepStrictEqual(advisedHistogram.histogram.dataPoints[0]
          .explicitBounds, [ 0.1, 1, 10 ]);
        assert.deepStrictEqual(advisedHistogram.histogram.dataPoints[0]
          .bucketCounts.map(Number), [ 2, 1, 1, 1 ]);
        const upDownCounter = testMeter.metrics.find(
          (metric) => metric.name === 'active-requests');
        assert.ok(upDownCounter);
        assert.strictEqual(upDownCounter.data, 'sum');
        assert.strictEqual(upDownCounter.sum.dataPoints[0].asDouble, 2);
        assert.strictEqual(upDownCounter.sum.isMonotonic, false);
        const observableCounter = testMeter.metrics.find(
          (metric) => metric.name === 'observed-requests');
        assert.ok(observableCounter);
        assert.strictEqual(observableCounter.data, 'sum');
        assert.strictEqual(observableCounter.sum.isMonotonic, true);
        assert.strictEqual(observableCounter.sum.dataPoints[0].asDouble, 11);
        assert.strictEqual(observableCounter.sum.dataPoints[0].attributes[0].key,
                           'source');
        const observableGauge = testMeter.metrics.find(
          (metric) => metric.name === 'observed-temperature');
        assert.ok(observableGauge);
        assert.strictEqual(observableGauge.data, 'gauge');
        assert.strictEqual(observableGauge.unit, 'Cel');
        assert.strictEqual(observableGauge.gauge.dataPoints[0].asDouble, -2);
        assert.strictEqual(delayedObservableValue, 42);
        assert.strictEqual(afterRejectionObservableValue, 99);
        const multipleCallbacks = testMeter.metrics.find(
          (metric) => metric.name === 'observed-multiple-callbacks');
        assert.ok(multipleCallbacks);
        assert.deepStrictEqual(multipleCallbacks.gauge.dataPoints.map(
          (point) => [ point.asDouble,
                       point.attributes.find((attr) => attr.key === 'callback')
              .value.stringValue ]), [ [ 1, 'a' ], [ 2, 'b' ] ]);
        const observableUpDownCounter = testMeter.metrics.find(
          (metric) => metric.name === 'observed-connections');
        assert.ok(observableUpDownCounter);
        assert.strictEqual(observableUpDownCounter.sum.isMonotonic, false);
        assert.strictEqual(
          observableUpDownCounter.sum.dataPoints[0].asDouble, -3);
        const runtimeHeap = testMeter.metrics.find(
          (metric) => metric.name === 'observed-runtime-heap');
        assert.ok(runtimeHeap);
        assert.strictEqual(runtimeHeap.data, 'gauge');
        assert.ok(runtimeHeap.gauge.dataPoints[0].asDouble > 0);
        const cardinality = testMeter.metrics.find(
          (metric) => metric.name === 'cardinality');
        assert.ok(cardinality);
        assert.strictEqual(cardinality.sum.dataPoints.length, 2000);
        const overflow = cardinality.sum.dataPoints.find((point) =>
          point.attributes.some((attr) =>
            attr.key === 'otel.metric.overflow' &&
            attr.value.boolValue));
        assert.ok(overflow);
        assert.strictEqual(overflow.asDouble, 2);
        const cardinalityPoint = cardinality.sum.dataPoints.find((point) =>
          point.attributes.some((attr) =>
            attr.key === 'id' && attr.value.intValue === '0'));
        assert.strictEqual(cardinalityPoint.asDouble, 6);
        assert.strictEqual(cardinality.sum.dataPoints.reduce(
          (total, point) => total + point.asDouble, 0), 2006);
        const normalized = testMeter.metrics.find(
          (metric) => metric.name === 'normalized');
        assert.ok(normalized);
        assert.strictEqual(normalized.sum.dataPoints.length, 1);
        assert.strictEqual(normalized.sum.dataPoints[0].asDouble, 5);
        const threadAttributes = testMeter.metrics.find(
          (metric) => metric.name === 'thread-attributes');
        assert.ok(threadAttributes);
        assert.strictEqual(threadAttributes.sum.dataPoints.length, 2);
        const pointsByThreadId = new Map(
          threadAttributes.sum.dataPoints.map((point) => [
            point.attributes.find((attr) => attr.key === 'thread.id')
              .value.intValue,
            point,
          ]));
        assert.strictEqual(pointsByThreadId.get('123').asDouble, 2);
        assert.strictEqual(pointsByThreadId.get('456').asDouble, 3);
        assert.strictEqual(pointsByThreadId.get('123').attributes.find(
          (attr) => attr.key === 'thread.name').value.stringValue, 'first');
        assert.strictEqual(pointsByThreadId.get('456').attributes.find(
          (attr) => attr.key === 'thread.name').value.stringValue, 'second');
        for (const point of threadAttributes.sum.dataPoints) {
          assert.ok(!point.attributes.some((attr) =>
            attr.key === 'service.instance.id'));
        }
        assert.strictEqual(workerCounterUnit, 'By');
        assert.strictEqual(workerCounterDescription, 'Bytes sent');
        assert.strictEqual(workerPoints.get('0'), 4);
        assert.strictEqual(workerPoints.get(String(workerThreadId)), 6);
        for (const [meter, value, temperature, requests, connections] of [
          [ testMeter, 4, -2, 11, -3 ],
          [ workerMeter, 6, -5, 3, 2 ],
        ]) {
          const getPoint = mustCallAtLeast((name) => {
            const metric = meter.metrics.find((metric) => metric.name === name);
            assert.ok(metric, name);
            const points = metric[metric.data].dataPoints;
            assert.strictEqual(points.length, 1);
            return points[0];
          });
          const counter = getPoint('shared-worker-requests');
          assert.strictEqual(counter.asDouble, value);
          assert.deepStrictEqual(counter.attributes, []);
          assert.strictEqual(getPoint('shared-worker-active').asDouble, -value);
          assert.strictEqual(getPoint('shared-worker-gauge').asDouble, value);
          const histogram = getPoint('shared-worker-duration');
          const histogramValue = value === 4 ? 2 : value;
          assert.strictEqual(histogram.count, '1');
          assert.strictEqual(histogram.sum, histogramValue);
          assert.strictEqual(histogram.min, histogramValue);
          assert.strictEqual(histogram.max, histogramValue);
          assert.deepStrictEqual(histogram.attributes, []);
          assert.strictEqual(getPoint('shared-worker-overflow').asDouble,
                             Number.MAX_VALUE);
          const overflowHistogram = getPoint('shared-worker-overflow-histogram');
          assert.strictEqual(overflowHistogram.count, '1');
          assert.strictEqual(overflowHistogram.sum, Number.MAX_VALUE);
          const conflict = getPoint('shared-worker-boundary-conflict');
          assert.strictEqual(conflict.count, '1');
          assert.strictEqual(conflict.sum, value === 4 ? 2 : 6);
          assert.strictEqual(conflict.min, conflict.sum);
          assert.strictEqual(conflict.max, conflict.sum);
          assert.deepStrictEqual(conflict.attributes, []);
          assert.deepStrictEqual(conflict.explicitBounds,
                                 value === 4 ? [ 1, 5 ] :
                                   histogram.explicitBounds);
          assert.deepStrictEqual(conflict.bucketCounts.map(Number),
                                 value === 4 ? [ 0, 1, 0 ] :
                                   [ 0, 0, 1, ...Array(13).fill(0) ]);
          assert.strictEqual(getPoint('observed-requests').asDouble, requests);
          assert.strictEqual(getPoint('observed-connections').asDouble,
                             connections);
          assert.strictEqual(getPoint('observed-temperature').asDouble,
                             temperature);
        }
        const otherCounter = otherMeter.metrics.find(
          (metric) => metric.name === 'requests');
        assert.ok(otherCounter);
        assert.strictEqual(otherCounter.sum.dataPoints.length, 1);
        assert.strictEqual(otherCounter.sum.dataPoints[0].asDouble, 7);

        const metrics = await child.metrics();
        const info = await child.info();
        assert.strictEqual(config.app, 'my_app_name');
        const { data, requestId } = await grpcServer.metrics(agentId);
        checkMetricsData(data.msg,
                         data.metadata,
                         requestId,
                         agentId,
                         config,
                         metrics,
                         info);

        await child.config({ tags: ['js-api-tag'] });
        const jsApiMetrics = await child.metrics();
        const jsApiInfo = await child.info();
        const jsApiData = await grpcServer.metrics(agentId);
        checkMetricsData(jsApiData.data.msg,
                         jsApiData.data.metadata,
                         jsApiData.requestId,
                         agentId,
                         config,
                         jsApiMetrics,
                         jsApiInfo);

        await grpcServer.reconfigure(agentId, { tags: ['reconfigured-tag'] });
        const updatedMetrics = await child.metrics();
        const updatedInfo = await child.info();
        const updatedData = await grpcServer.metrics(agentId);
        checkMetricsData(updatedData.data.msg,
                         updatedData.data.metadata,
                         updatedData.requestId,
                         agentId,
                         config,
                         updatedMetrics,
                         updatedInfo);

        const waitForMetrics = (check) => new Promise((resolve) => {
          const onMetrics = (exportedMetrics) => {
            if (check(exportedMetrics)) {
              resolve(exportedMetrics);
              return;
            }
            grpcServer.once('metrics', onMetrics);
          };
          grpcServer.once('metrics', onMetrics);
        });
        const callbackPoints = (exportedMetrics) => {
          const scope = exportedMetrics.resourceMetrics[0].scopeMetrics.find(
            (item) => item.scope.name === 'test');
          return scope?.metrics.find((metric) =>
            metric.name === 'observed-multiple-callbacks')?.gauge.dataPoints ??
            [];
        };
        await child.removeObservableCallback('throwing');
        await waitForMetrics((exportedMetrics) =>
          callbackPoints(exportedMetrics).length === 2);
        const callbackARemoved = waitForMetrics((exportedMetrics) => {
          const points = callbackPoints(exportedMetrics);
          return points.length === 1 && points[0].asDouble === 2 &&
            points[0].attributes.find((attr) => attr.key === 'callback')
              .value.stringValue === 'b';
        });
        await child.removeObservableCallback('a');
        await callbackARemoved;
        const callbacksRemoved = waitForMetrics((exportedMetrics) =>
          hasThreadSnapshot(exportedMetrics, 0) &&
          callbackPoints(exportedMetrics).length === 0);
        await child.removeObservableCallback('b');
        await callbacksRemoved;
        const observableMetricNames = [
          'observed-requests',
          'observed-connections',
          'observed-temperature',
          'observed-runtime-heap',
          'observed-async-value',
          'observed-async-failure',
          'observed-multiple-callbacks',
          'external-batch-gauge',
          'external-batch-counter',
        ];
        const noObservablePoints = waitForMetrics((exportedMetrics) => {
          const scope = exportedMetrics.resourceMetrics[0].scopeMetrics.find(
            (item) => item.scope.name === 'test');
          return hasThreadSnapshot(exportedMetrics, 0) &&
            !scope?.metrics.some((metric) =>
              observableMetricNames.includes(metric.name) &&
              metric[metric.data]?.dataPoints?.length > 0);
        });
        await child.removeObservableCallback('all');
        await noObservablePoints;
        const blockDuration = 16000;
        const blockStarted = Date.now();
        const blockFinished = child.waitForWorkerBlock(workerThreadId);
        const callbackCountAtBlock = await child.block(workerThreadId,
                                                       blockDuration);
        await waitForMetrics((exportedMetrics) =>
          hasThreadSnapshot(exportedMetrics, workerThreadId));
        assert.ok(Date.now() - blockStarted < blockDuration,
                  'worker metrics should arrive while its event loop is blocked');
        const callbackCountAfterBlock = await blockFinished;
        assert.strictEqual(callbackCountAfterBlock, callbackCountAtBlock + 1);
        const mainMetricsDisabled = waitForMetrics((exportedMetrics) => {
          const scopes = exportedMetrics.resourceMetrics[0].scopeMetrics;
          const mainCounterNames = [
            'requests', 'cardinality', 'normalized', 'thread-attributes',
            'temperature',
          ];
          const mainCountersPresent = scopes.some((scope) =>
            (scope.scope.name === 'other' ||
             scope.scope.name === 'after-disable') ||
            (scope.scope.name === 'test' && scope.metrics.some((metric) =>
              mainCounterNames.includes(metric.name))));
          const mainWorkerPointPresent = scopes.some((scope) =>
            scope.scope.name === 'test' && scope.metrics.some((metric) =>
              metric.name === 'worker-requests' &&
              metric.sum.dataPoints.some((point) =>
                point.attributes.some((attr) =>
                  attr.key === 'thread.id' && attr.value.intValue === '0'))));
          return hasThreadSnapshot(exportedMetrics, 0) &&
            !mainCountersPresent && !mainWorkerPointPresent;
        });
        await child.disableMetrics();
        await mainMetricsDisabled;

        const workerMetricsActive = waitForMetrics((exportedMetrics) => {
          const scope = exportedMetrics.resourceMetrics[0].scopeMetrics.find(
            (item) => item.scope.name === 'test');
          const counter = scope?.metrics.find(
            (metric) => metric.name === 'worker-requests');
          const sharedCounter = scope?.metrics.find(
            (metric) => metric.name === 'shared-worker-requests');
          const sharedHistogram = scope?.metrics.find(
            (metric) => metric.name === 'shared-worker-duration');
          return counter?.sum.dataPoints.some((point) =>
            point.attributes.some((attr) =>
              attr.key === 'thread.id' &&
              attr.value.intValue === String(workerThreadId)) &&
            point.asDouble === 9) &&
            sharedCounter?.sum.dataPoints[0]?.asDouble === 9 &&
            sharedHistogram?.histogram.dataPoints[0]?.count === '2' &&
            sharedHistogram.histogram.dataPoints[0]?.sum === 9;
        });
        await child.workerCounter(workerThreadId, 3);
        await workerMetricsActive;

        const workerMetricsDisabled = waitForMetrics((exportedMetrics) => {
          const scopes = exportedMetrics.resourceMetrics[0].scopeMetrics;
          const workerCounter = scopes.find((scope) =>
            scope.scope.name === 'test')?.metrics.find(
            (metric) => metric.name === 'worker-requests');
          const workerPointPresent = workerCounter?.sum.dataPoints.some(
            (point) => point.attributes.some((attr) =>
              attr.key === 'thread.id' &&
              attr.value.intValue === String(workerThreadId)));
          return hasThreadSnapshot(exportedMetrics, workerThreadId) &&
            !workerPointPresent && !scopes.some((scope) =>
            scope.scope.name === 'test');
        });
        await child.disableWorkerMetrics(workerThreadId);
        await workerMetricsDisabled;
        await child.terminateWorker(workerThreadId);

        const exitingWorkerMetricsActive = waitForMetrics((exportedMetrics) => {
          const scope = exportedMetrics.resourceMetrics[0].scopeMetrics.find(
            (item) => item.scope.name === 'test');
          const gauge = scope?.metrics.find(
            (metric) => metric.name === 'worker-exit-gauge');
          const sharedCounter = scope?.metrics.find(
            (metric) => metric.name === 'shared-worker-requests');
          const sharedHistogram = scope?.metrics.find(
            (metric) => metric.name === 'shared-worker-duration');
          const workerCounter = scope?.metrics.find(
            (metric) => metric.name === 'worker-requests');
          return gauge?.gauge.dataPoints[0]?.asDouble === 5 &&
            !workerCounter?.sum.dataPoints.some((point) =>
              point.attributes.some((attr) =>
                attr.key === 'thread.id' &&
                attr.value.intValue === String(workerThreadId))) &&
            sharedCounter?.sum.dataPoints[0]?.asDouble === 5 &&
            sharedHistogram?.histogram.dataPoints[0]?.count === '1' &&
            sharedHistogram.histogram.dataPoints[0]?.sum === 5;
        });
        await child.workerCounter(exitingWorkerThreadId, 5);
        await exitingWorkerMetricsActive;

        const exitingWorkerMetricsCleared = waitForMetrics(
          (exportedMetrics) => {
            const scope = exportedMetrics.resourceMetrics[0].scopeMetrics.find(
              (item) => item.scope.name === 'test');
            const exitGauge = scope?.metrics.find(
              (metric) => metric.name === 'worker-exit-gauge');
            const observable = scope?.metrics.find(
              (metric) =>
                metric.name === 'worker-observable-collection-count');
            const sharedCounter = scope?.metrics.find(
              (metric) => metric.name === 'shared-worker-requests');
            return (!exitGauge || exitGauge.gauge.dataPoints.length === 0) &&
              (!observable || observable.gauge.dataPoints.length === 0) &&
              hasThreadSnapshot(exportedMetrics, 0) && !sharedCounter;
          });
        await child.terminateWorker(exitingWorkerThreadId);
        await exitingWorkerMetricsCleared;
        await child.shutdown(0);
        grpcServer.close();
        resolve();
      });
      grpcServer.once('metrics', onMetrics);

      await child.addCounter('requests');
      await child.workerCounter(workerThreadId);
      await child.registerApiMetrics();
      for (let i = 0; i < 10; i++) {
        await child.trace('http');
      }
    }));
  });
}

const testConfigs = [
  {
    getEnv: (port) => {
      return {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_GRPC: `localhost:${port}`,
      };
    },
  },
  {
    getEnv: (port) => {
      return {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_SAAS: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbtesting.localhost:${port}`,
      };
    },
  },
];

for (const testConfig of testConfigs) {
  await runTest(testConfig);
  console.log('run test!');
}
