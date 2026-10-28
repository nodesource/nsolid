// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fixtures from '../common/fixtures.js';
import { OTLPServer, OTLPGRPCServer } from '../common/nsolid-otlp-agent/index.js';

function waitFor(emitter, event, observed, check, start = 0) {
  const existing = observed.slice(start).find(check);
  if (existing !== undefined) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      emitter.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 30000);
    const onEvent = (data) => {
      if (!check(data)) return;
      clearTimeout(timeout);
      emitter.off(event, onEvent);
      resolve(data);
    };
    emitter.on(event, onEvent);
  });
}

async function startChild(protocol, fixture, args = []) {
  const server = protocol === 'http' ? new OTLPServer() : new OTLPGRPCServer();
  const exports = [];
  server.on('metrics', (data) => exports.push(data));
  const port = await new Promise((resolve) => server.start(mustSucceed(resolve)));
  const env = {
    NSOLID_OTLP: 'otlp',
    NSOLID_INTERVAL: '100',
    OTEL_EXPORTER_OTLP_TIMEOUT: '2000',
    NSOLID_OTLP_CONFIG: JSON.stringify({ url: `http://localhost:${port}`, protocol }),
  };
  // Also exercise the generic exporter's environment-based configuration.
  if (protocol === 'grpc' && args.length === 0) {
    delete env.NSOLID_OTLP_CONFIG;
    env.OTEL_EXPORTER_OTLP_METRICS_PROTOCOL = 'grpc';
    env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = `http://localhost:${port}/v1/metrics`;
  }
  const child = fork(fixtures.path(fixture), args, { env });
  const messages = [];
  child.on('message', (message) => messages.push(message));
  const exited = once(child, 'exit');
  return {
    child, exports, exited,
    message: (type, check = () => true) =>
      waitFor(child, 'message', messages,
              (message) => message.type === type && check(message)),
    exported: (check, start = exports.length) =>
      waitFor(server, 'metrics', exports, check, start),
    async close() {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await exited;
      // The collector's IPC stream delivers all metrics before its exit event.
      await server.close();
    },
  };
}

function getScope(exported) {
  return exported.resourceMetrics[0].scopeMetrics.find((scope) =>
    scope.scope.name === 'custom-otlp');
}

function getMetric(scope, name) {
  return scope?.metrics.find((metric) => metric.name === name);
}

function points(metric) {
  return metric?.[metric.data ?? (metric.sum ? 'sum' :
    metric.gauge ? 'gauge' : 'histogram')]?.dataPoints ?? [];
}

function attribute(point, key) {
  return point.attributes?.find((item) => item.key === key)?.value;
}

function sourceOf(exported) {
  return attribute(points(getMetric(getScope(exported), 'requests'))[0] ?? {},
                   'source')?.stringValue;
}

function checkInitial(exported, id, sharedValue) {
  const resource = exported.resourceMetrics[0];
  assert.strictEqual(resource.resource.attributes.find((item) =>
    item.key === 'service.instance.id').value.stringValue, id);
  const scope = getScope(exported);
  assert.strictEqual(scope.scope.version, '1.2.3');
  assert.strictEqual(scope.schemaUrl, 'https://example.com/metrics');
  const requests = getMetric(scope, 'requests');
  assert.strictEqual(requests.unit, '1');
  assert.strictEqual(requests.description, 'Completed requests');
  assert.strictEqual(requests.sum.isMonotonic, true);
  assert.strictEqual(requests.sum.aggregationTemporality,
                     'AGGREGATION_TEMPORALITY_CUMULATIVE');
  assert.deepStrictEqual(points(requests).map((point) => point.asDouble), [5, 7]);
  const first = points(requests)[0];
  assert.strictEqual(attribute(first, 'status').intValue, '200');
  assert.deepStrictEqual(attribute(first, 'strings').arrayValue.values.map(
    (item) => item.stringValue), ['ok', 'api']);
  assert.deepStrictEqual(attribute(first, 'booleans').arrayValue.values.map(
    (item) => item.boolValue), [true, false]);
  assert.deepStrictEqual(attribute(first, 'numbers').arrayValue.values.map(
    (item) => item.doubleValue), [1, 2.5]);
  assert.strictEqual(points(getMetric(scope, 'shared'))[0].asDouble, sharedValue);
  assert.strictEqual(points(getMetric(scope, 'active'))[0].asDouble, 3);
  assert.strictEqual(getMetric(scope, 'active').sum.isMonotonic ?? false, false);
  assert.strictEqual(points(getMetric(scope, 'temperature'))[0].asDouble, 9);
  const histogram = getMetric(scope, 'duration');
  assert.strictEqual(histogram.unit, 'ms');
  assert.strictEqual(histogram.description, 'Request duration');
  const duration = points(histogram)[0];
  assert.strictEqual(duration.count, '2');
  assert.strictEqual(duration.sum, 6);
  assert.strictEqual(duration.min, 2);
  assert.strictEqual(duration.max, 4);
  assert.deepStrictEqual(duration.explicitBounds, [1, 5]);
  assert.deepStrictEqual(duration.bucketCounts.map(Number), [0, 2, 0]);
  assert.strictEqual(points(getMetric(scope, 'observed-total'))[0].asDouble, 11);
  assert.strictEqual(points(getMetric(scope, 'observed-active'))[0].asDouble, -3);
  assert.strictEqual(points(getMetric(scope, 'observed-value'))[0].asDouble, 42);
  for (const metric of scope.metrics) {
    for (const point of points(metric)) {
      assert.strictEqual(point.timeUnixNano, first.timeUnixNano);
      assert.ok(!attribute(point, 'thread.id'));
      assert.ok(!attribute(point, 'thread.name'));
    }
  }
}

for (const protocol of ['http', 'grpc']) {
  const live = await startChild(protocol, 'nsolid-otel-metrics-otlp.js');
  try {
    const { id } = await live.message('ready');
    for (const [source, shared] of [['main', 4], ['worker', 6]]) {
      const initial = await live.exported((data) => sourceOf(data) === source &&
        points(getMetric(getScope(data), 'observed-value')).length === 1, 0);
      checkInitial(initial, id, shared);
    }
    live.child.send({ type: 'hold' });
    await live.message('pending');
    let previous;
    const held = await live.exported((data) => {
      if (sourceOf(data) !== 'main') return false;
      const time = points(getMetric(getScope(data), 'requests'))[0].timeUnixNano;
      const unchanged = previous === time;
      previous = time;
      return unchanged;
    });
    live.child.send({ type: 'release' });
    const released = await live.exported((data) => sourceOf(data) === 'main' &&
      points(getMetric(getScope(data), 'observed-value'))[0]?.asDouble === 84);
    assert.ok(BigInt(points(getMetric(getScope(released), 'requests'))[0].timeUnixNano) >
      BigInt(points(getMetric(getScope(held), 'requests'))[0].timeUnixNano));
    live.child.send({ type: 'finish_worker' });
    await live.exported((data) => sourceOf(data) === 'worker' &&
      points(getMetric(getScope(data), 'shared'))[0]?.asDouble === 7);
    assert.strictEqual((await live.message('worker_exit')).code, 0);
    live.child.send({ type: 'finish_main' });
    await live.exported((data) => sourceOf(data) === 'main' &&
      points(getMetric(getScope(data), 'shared'))[0]?.asDouble === 5);
    assert.deepStrictEqual(await live.exited, [0, null]);
  } finally {
    await live.close();
  }
  for (const data of live.exports) {
    const shared = getMetric(getScope(data), 'shared');
    if (!shared) continue;
    assert.strictEqual(points(shared).length, 1);
    assert.ok([4, 5, 6, 7].includes(points(shared)[0].asDouble));
    assert.deepStrictEqual(points(shared)[0].attributes ?? [], []);
  }

  for (const mode of ['natural', 'explicit', 'disabled']) {
    const closing = await startChild(protocol, 'nsolid-otel-metrics-exit.js', [mode]);
    try {
      await Promise.all(['main', 'worker'].map((source) =>
        closing.message('pending', (message) => message.source === source)));
      closing.child.send({ type: 'finish_worker' });
      assert.strictEqual((await closing.message('worker_exit')).code, 0);
      closing.child.send({ type: 'finish_main' });
      assert.deepStrictEqual(await closing.exited, [0, null]);
    } finally {
      await closing.close();
    }
    const metrics = closing.exports.flatMap((data) =>
      data.resourceMetrics[0].scopeMetrics.filter((scope) =>
        scope.scope.name === 'shutdown-metrics').flatMap((scope) => scope.metrics));
    assert.ok(!metrics.some((metric) => metric.name === 'partial'));
    if (mode === 'disabled') {
      assert.deepStrictEqual(metrics, []);
      continue;
    }
    for (const source of ['main', 'worker']) {
      const finalPoint = (name) => metrics.filter((metric) => metric.name === name)
        .flatMap(points).findLast((point) =>
          attribute(point, 'source')?.stringValue === source);
      const counter = finalPoint('requests');
      assert.ok(counter, `Missing final ${protocol} ${mode} ${source} counter`);
      assert.strictEqual(counter.asDouble, 3);
      assert.strictEqual(finalPoint('active').asDouble, 3);
      assert.strictEqual(finalPoint('temperature').asDouble, 7);
      const histogram = finalPoint('duration');
      assert.strictEqual(histogram.count, '2');
      assert.strictEqual(histogram.sum, 6);
      assert.strictEqual(histogram.timeUnixNano, counter.timeUnixNano);
    }
  }
}
