// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { GRPCServer, TestClient } from '../common/nsolid-grpc-agent/index.js';

const grpcServer = new GRPCServer();
const port = await new Promise((resolve) => {
  grpcServer.start(mustSucceed(resolve));
});
const child = new TestClient([], {
  env: {
    NSOLID_GRPC_INSECURE: '1',
    NSOLID_GRPC: `localhost:${port}`,
    NSOLID_INTERVAL: '500',
  },
});
const exports = [];
grpcServer.on('metrics', (metrics) => exports.push(metrics));

function waitForClientMessage(type) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.child().off('message', onMessage);
      reject(new Error(`Timed out waiting for ${type}`));
    }, 30000);
    const onMessage = (message) => {
      if (message.type !== type) return;
      clearTimeout(timeout);
      child.child().off('message', onMessage);
      resolve(message);
    };
    child.child().on('message', onMessage);
  });
}

function sendToClient(type, responseType = `${type}_done`) {
  const response = waitForClientMessage(responseType);
  child.child().send({ type });
  return response;
}

function waitForExport(check, start = 0, label = 'metrics export') {
  for (let i = start; i < exports.length; i++) {
    if (check(exports[i])) return Promise.resolve(exports[i]);
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      grpcServer.off('metrics', onMetrics);
      reject(new Error(`Timed out waiting for ${label}`));
    }, 30000);
    const onMetrics = (metrics) => {
      if (!check(metrics)) return;
      clearTimeout(timeout);
      grpcServer.off('metrics', onMetrics);
      resolve(metrics);
    };
    grpcServer.on('metrics', onMetrics);
  });
}

function getScope(exported, name, version = '1.0', schemaUrl) {
  return exported.resourceMetrics[0].scopeMetrics.find((scope) =>
    scope.scope.name === name && scope.scope.version === version &&
    (schemaUrl === undefined || scope.schemaUrl === schemaUrl));
}

function getMetric(scope, name) {
  return scope?.metrics.find((metric) => metric.name === name);
}

function getPoint(metric, type = 'gauge') {
  return metric?.[type]?.dataPoints ?? [];
}

function getMainThreadSnapshot(exported) {
  const scope = exported.resourceMetrics[0].scopeMetrics.find(
    (item) => item.scope.name === 'nsolid');
  return scope?.metrics.some((metric) =>
    getPoint(metric, metric.data).some((point) =>
      point.attributes.some((attribute) => attribute.key === 'thread.id' &&
        attribute.value.intValue === '0'))) ?? false;
}

function getBatchRuns(exported) {
  const point = getPoint(getMetric(getScope(exported, 'api-contract'),
                                   'batch-callback-runs'))[0];
  return point?.asDouble;
}

function getCollectionTimes(exported) {
  const scope = getScope(exported, 'api-contract');
  return [ 'integer-value-type', 'cumulative-histogram', 'batch-second' ]
    .map((name) => {
      const metric = getMetric(scope, name);
      return getPoint(metric, metric.data)[0].timeUnixNano;
    });
}

try {
  await child.id();
  await child.config({ app: 'otel-metrics-api-contract' });
  await sendToClient('api_metrics_contract_setup',
                     'api_metrics_contract_ready');

  const initial = await waitForExport((exported) => {
    const scope = getScope(exported, 'api-contract');
    return scope && getMetric(scope, 'latency') &&
      getMetric(scope, 'histogram-cardinality') &&
      getPoint(getMetric(scope, 'observable-cardinality'), 'sum').length ===
        2000 &&
      getPoint(getMetric(scope, 'observable-updown-cardinality'), 'sum')
        .length === 2000 &&
      getBatchRuns(exported) !== undefined;
  });
  const scope = getScope(initial, 'api-contract');

  const latency = getMetric(scope, 'latency');
  assert.strictEqual(latency.unit, 'ms');
  assert.strictEqual(latency.description, 'Initial histogram metadata');
  const latencyPoint = latency.histogram.dataPoints[0];
  assert.strictEqual(latencyPoint.count, '2');
  assert.strictEqual(latencyPoint.sum, 5);
  assert.strictEqual(latencyPoint.min, 2);
  assert.strictEqual(latencyPoint.max, 3);
  assert.deepStrictEqual(latencyPoint.explicitBounds, [ 1, 5 ]);

  const empty = getMetric(scope, 'empty-histogram');
  assert.ok(!empty || empty.histogram.dataPoints.length === 0);

  const cumulative = getMetric(scope, 'cumulative-histogram')
    .histogram.dataPoints[0];
  assert.strictEqual(cumulative.count, '2');
  assert.strictEqual(cumulative.sum, 3);
  const route = cumulative.attributes.find((attribute) =>
    attribute.key === 'route');
  assert.strictEqual(route.value.stringValue, '/items');

  const cardinality = getMetric(scope, 'histogram-cardinality')
    .histogram.dataPoints;
  assert.strictEqual(cardinality.length, 2000);
  const overflow = cardinality.find((point) =>
    point.attributes.some((attribute) =>
      attribute.key === 'otel.metric.overflow' &&
      attribute.value.boolValue));
  assert.ok(overflow);
  assert.strictEqual(overflow.count, '2');
  const idZero = cardinality.find((point) =>
    point.attributes.some((attribute) =>
      attribute.key === 'id' && attribute.value.intValue === '0'));
  assert.strictEqual(idZero.count, '2');
  assert.strictEqual(idZero.sum, 6);
  assert.strictEqual(cardinality.reduce((count, point) =>
    count + Number(point.count), 0), 2002);
  assert.strictEqual(cardinality.reduce((sum, point) => sum + point.sum, 0),
                     2006);

  const integerValueType = getMetric(scope, 'integer-value-type');
  assert.strictEqual(integerValueType.sum.dataPoints[0].asDouble, 3);
  assert.strictEqual(integerValueType.sum.dataPoints[0].asInt, undefined);

  const observedCounter = getMetric(scope, 'observed-counter-absolute');
  assert.strictEqual(observedCounter.sum.dataPoints.length, 1);
  assert.strictEqual(observedCounter.sum.dataPoints[0].asDouble, 7);

  const observableCardinality = getMetric(scope, 'observable-cardinality')
    .sum.dataPoints;
  assert.strictEqual(observableCardinality.length, 2000);
  const observableOverflow = observableCardinality.find((point) =>
    point.attributes.some((attribute) =>
      attribute.key === 'otel.metric.overflow' && attribute.value.boolValue));
  assert.strictEqual(observableOverflow.asDouble, 8);
  assert.strictEqual(observableCardinality.reduce((sum, point) =>
    sum + point.asDouble, 0), 2007);
  const observableUpDownCardinality = getMetric(
    scope, 'observable-updown-cardinality').sum.dataPoints;
  const observableUpDownOverflow = observableUpDownCardinality.find((point) =>
    point.attributes.some((attribute) =>
      attribute.key === 'otel.metric.overflow' && attribute.value.boolValue));
  assert.ok(Math.abs(observableUpDownOverflow.asDouble - 1.3e308) < 1e294);
  await sendToClient('api_metrics_contract_remove_cardinality',
                     'api_metrics_contract_cardinality_removed');

  for (const [name, version, schemaUrl, value] of [
    [ 'api-contract', '1.0', 'https://example.com/metrics/schema', 1 ],
    [ 'api-contract', '2.0', 'https://example.com/metrics/schema', 2 ],
    [ 'api-contract', '1.0', 'https://example.com/other-schema', 3 ],
    [ 'other-api-contract', '1.0', 'https://example.com/metrics/schema', 4 ],
  ]) {
    const identityScope = getScope(initial, name, version, schemaUrl);
    const identity = getMetric(identityScope, 'meter-identity');
    assert.strictEqual(identity.sum.dataPoints[0].asDouble, value);
  }

  const batchFirst = getPoint(getMetric(scope, 'batch-first'))[0];
  assert.strictEqual(batchFirst.asDouble, 11);
  const batchSecond = getPoint(getMetric(scope, 'batch-second'))[0];
  assert.strictEqual(batchSecond.asDouble, 12);
  assert.strictEqual(getPoint(getMetric(scope, 'batch-undeclared'))[0]
    .asDouble, 13);
  assert.strictEqual(getMetric(scope, 'batch-never-declared'), undefined);

  let previousRuns = getBatchRuns(initial);
  const nextBatchExport = await waitForExport((exported) => {
    const runs = getBatchRuns(exported);
    if (!(runs > previousRuns)) return false;
    previousRuns = runs;
    return true;
  }, exports.length, 'batch callback run');
  previousRuns = getBatchRuns(nextBatchExport);

  await sendToClient('api_metrics_contract_remove_batch',
                     'api_metrics_contract_batch_removed');
  await waitForExport((exported) => {
    return getMainThreadSnapshot(exported) &&
      getPoint(getMetric(getScope(exported, 'api-contract'),
                         'batch-first')).length === 0 &&
      getPoint(getMetric(getScope(exported, 'api-contract'),
                         'batch-second')).length === 1;
  }, exports.length, 'batch callback removal');

  const updatedHistogram = waitForExport((exported) => {
    const point = getMetric(getScope(exported, 'api-contract'),
                            'cumulative-histogram')?.histogram.dataPoints[0];
    return point?.count === '3' && point.sum === 7;
  }, exports.length, 'cumulative histogram update');
  await sendToClient('api_metrics_contract_update_histogram',
                     'api_metrics_contract_histogram_updated');
  await updatedHistogram;

  const firstStarted = waitForClientMessage('api_metrics_async_first_started');
  const secondStarted = waitForClientMessage('api_metrics_async_second_started');
  const batchStarted = waitForClientMessage('api_metrics_async_batch_started');
  await sendToClient('api_metrics_contract_start_async',
                     'api_metrics_contract_async_registered');
  await Promise.all([ firstStarted, secondStarted, batchStarted ]);

  const pendingExportStart = exports.length;
  const pendingExport = await waitForExport((exported) =>
    getMainThreadSnapshot(exported), pendingExportStart, 'pending callback snapshot');
  assert.strictEqual(getPoint(getMetric(getScope(pendingExport, 'api-contract'),
                                        'async-completion')).length, 0);
  const pendingTimes = getCollectionTimes(pendingExport);
  assert.strictEqual(new Set(pendingTimes).size, 1);
  assert.ok(BigInt(pendingTimes[0]) > 0n);

  await sendToClient('api_metrics_contract_release_first',
                     'api_metrics_contract_first_released');
  const afterFirstRelease = await waitForExport((exported) =>
    getMainThreadSnapshot(exported), exports.length, 'first async callback completion');
  assert.strictEqual(getPoint(getMetric(getScope(afterFirstRelease,
                                                 'api-contract'),
                                        'async-completion')).length, 0);
  assert.deepStrictEqual(getCollectionTimes(afterFirstRelease), pendingTimes);

  await sendToClient('api_metrics_contract_disable_release_second',
                     'api_metrics_contract_second_released');
  const waitingForBatch = await waitForExport((exported) =>
    getMainThreadSnapshot(exported), exports.length,
                                              'waiting for batch callback');
  assert.strictEqual(getPoint(getMetric(getScope(waitingForBatch,
                                                 'api-contract'),
                                        'async-completion')).length, 0);
  assert.deepStrictEqual(getCollectionTimes(waitingForBatch), pendingTimes);

  await sendToClient('api_metrics_contract_release_batch',
                     'api_metrics_contract_batch_released');
  const completedExport = await waitForExport((exported) => {
    if (!getMainThreadSnapshot(exported)) return false;
    const scope = getScope(exported, 'api-contract');
    const individual = getPoint(getMetric(scope, 'async-completion'));
    const batch = getPoint(getMetric(scope, 'async-batch-completion'));
    return individual.length === 2 && batch.length === 1;
  }, exports.length, 'completed async callbacks');
  const completedScope = getScope(completedExport, 'api-contract');
  const completedTimes = getCollectionTimes(completedExport);
  assert.strictEqual(new Set(completedTimes).size, 1);
  assert.ok(BigInt(completedTimes[0]) > BigInt(pendingTimes[0]));
  const individualPoints = getPoint(getMetric(completedScope,
                                              'async-completion'));
  assert.deepStrictEqual(individualPoints.map((point) => point.asDouble),
                         [ 41, 42 ]);
  assert.strictEqual(getPoint(getMetric(completedScope,
                                        'async-batch-completion'))[0]
    .asDouble, 43);

  const disableStarted = waitForClientMessage(
    'api_metrics_disable_callback_started');
  await sendToClient('api_metrics_contract_start_disable',
                     'api_metrics_contract_disable_registered');
  await disableStarted;
  await sendToClient('api_metrics_contract_disable_release',
                     'api_metrics_contract_disabled');
  const disabledExport = await waitForExport(
    (exported) => getMainThreadSnapshot(exported) &&
      !exported.resourceMetrics[0].scopeMetrics.some((item) =>
        item.scope.name === 'api-contract' ||
        item.scope.name === 'foreign-api-contract' ||
        item.scope.name === 'other-api-contract'),
    exports.length,
    'disable snapshot');
  assert.ok(disabledExport);
} finally {
  await child.shutdown(0);
  grpcServer.close();
}
