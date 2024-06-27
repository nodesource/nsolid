// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { setTimeout } from 'node:timers/promises';
import {
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';
import validators from 'internal/validators';

const {
  validateArray,
  validateBoolean,
  validateString,
  validateNumber,
  validateObject,
  validateUint32
} = validators;

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

function checkResource(resource, agentId, config, metrics) {
  validateArray(resource.attributes, 'attributes');

  const expectedAttributes = {
    'telemetry.sdk.version': '1.16.0',
    'telemetry.sdk.language': 'cpp',
    'telemetry.sdk.name': 'opentelemetry',
    'service.instance.id': agentId,
    'service.name': config.app,
    'process.title': metrics.title,
    'process.owner': metrics.user,
  };

  assert.strictEqual(resource.attributes.length, Object.keys(expectedAttributes).length);

  resource.attributes.forEach((attribute) => {
    assert.strictEqual(attribute.value.stringValue, expectedAttributes[attribute.key]);
    delete expectedAttributes[attribute.key];
  });

  assert.strictEqual(Object.keys(expectedAttributes).length, 0);
}

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
    console.dir(metric, { depth: null });
    assert.strictEqual(metric.unit, unit);
    assert.strictEqual(metric.data, aggregation);
    const dataPoints = metric[aggregation].dataPoints;
    assert.strictEqual(dataPoints.length, 1);
    const dataPoint = dataPoints[0];
    assert.strictEqual(dataPoint.attributes.length, 2);
    const threadIdAttr = dataPoint.attributes.find((a) => a.key === 'thread.id');
    assert.ok(threadIdAttr);
    assert.strictEqual(threadIdAttr.value.intValue, '0');
    const threadNameAttr = dataPoint.attributes.find((a) => a.key === 'thread.name');
    assert.ok(threadNameAttr);
    assert.strictEqual(threadNameAttr.value.stringValue, '');
    if (metric.data == 'summary') {
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
}

function checkMetricsData(msg, metadata, requestId, agentId, nsolidConfig, nsolidMetrics) {
  console.dir(msg, { depth: null });
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
  checkResource(resourceMetrics[0].resource, agentId, nsolidConfig, nsolidMetrics);
  checkScopeMetrics(resourceMetrics[0].scopeMetrics);
}

async function runTest({ getEnv }) {
  return new Promise((resolve) => {
    const grpcServer = new GRPCServer();
    grpcServer.start(mustSucceed(async (port) => {
      console.log('GRPC server started', port);
      const env = getEnv(port);
      const opts = {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env,
      };
      const child = new TestClient([], opts);
      const agentId = await child.id();
      const config = await child.config();
      const metrics = await child.metrics();
      await setTimeout(200);
      const { data, requestId } = await grpcServer.metrics(agentId);
      checkMetricsData(data.msg, data.metadata, requestId, agentId, config, metrics);
      await child.shutdown(0);
      grpcServer.close();
      resolve();
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
        NSOLID_INTERVAL: 100,
      };
    }
  },
];

for (const testConfig of testConfigs) {
  await runTest(testConfig);
  console.log('run test!');
}
