// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { GRPCServer, TestClient } from '../common/nsolid-grpc-agent/index.js';

const grpcServer = new GRPCServer();

await new Promise((resolve) => {
  grpcServer.start(mustSucceed(async (port) => {
    const env = {
      NSOLID_GRPC_INSECURE: 1,
      NSOLID_GRPC: `localhost:${port}`,
      NSOLID_INTERVAL: 500,
    };
    const child = new TestClient(['-t', 'http'], { env });
    await child.config({ app: 'metrics-validation' });

    const exportedMetrics = new Promise((resolveMetrics) => {
      const onMetrics = (exported) => {
        const scope = exported.resourceMetrics[0].scopeMetrics.find(
          (item) => item.scope.name === 'validation' &&
            item.scope.version === '1.0');
        if (!scope || !scope.metrics.some((metric) =>
          metric.name === 'valid-updates') || !scope.metrics.some((metric) =>
          metric.name === 'cumulative-overflow') || !scope.metrics.some(
          (metric) => metric.name === 'valid-observations')) {
          grpcServer.once('metrics', onMetrics);
          return;
        }
        resolveMetrics(scope.metrics);
      };
      grpcServer.once('metrics', onMetrics);
    });

    assert.deepStrictEqual(await child.validateMetrics(),
                           Array(15).fill(false));
    const metrics = await exportedMetrics;
    const validUpdates = metrics.find((metric) =>
      metric.name === 'valid-updates');
    assert.strictEqual(validUpdates.sum.dataPoints.length, 1);
    assert.strictEqual(validUpdates.sum.dataPoints[0].asDouble, 15);
    const cached = metrics.find((metric) => metric.name === 'cached-attributes');
    const cachedValues = new Map(cached.sum.dataPoints.map((point) => [
      point.attributes.find((attribute) => attribute.key === 'b').value.intValue,
      point.asDouble,
    ]));
    assert.deepStrictEqual(cachedValues, new Map([ ['2', 8], ['3', 2] ]));
    const gauge = metrics.find((metric) => metric.name === 'temperature');
    assert.ok(gauge);
    assert.strictEqual(gauge.data, 'gauge');
    assert.strictEqual(gauge.unit, 'Cel');
    assert.strictEqual(gauge.description, 'Temperature');
    assert.strictEqual(gauge.gauge.dataPoints.length, 2);
    const temperatures = new Map(gauge.gauge.dataPoints.map((point) => [
      point.attributes.find((attr) => attr.key === 'location').value.stringValue,
      point.asDouble,
    ]));
    assert.strictEqual(temperatures.get('inside'), -5);
    assert.strictEqual(temperatures.get('outside'), 0);
    const cumulativeOverflow = metrics.find((metric) =>
      metric.name === 'cumulative-overflow');
    assert.strictEqual(cumulativeOverflow.sum.dataPoints.length, 1);
    assert.strictEqual(cumulativeOverflow.sum.dataPoints[0].asDouble,
                       Number.MAX_VALUE);
    const observable = metrics.find((metric) =>
      metric.name === 'valid-observations');
    assert.strictEqual(observable.sum.dataPoints.length, 1);
    assert.strictEqual(observable.sum.dataPoints[0].asDouble, 7);

    await child.shutdown(0);
    grpcServer.close();
    resolve();
  }));
});
