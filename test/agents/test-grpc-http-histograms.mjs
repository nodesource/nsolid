// Flags: --expose-internals
import { mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import {
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';
import validators from 'internal/validators';

const {
  validateArray,
  validateNumber,
} = validators;

// Expected exponential histogram metrics exported by the GrpcAgent.
// The GrpcAgent uses use_snake_case=false, so names are camelCase.
const expectedHistograms = [
  ['http.client.request.duration', 's'],
  ['http.server.request.duration', 's'],
];

// Semconv attribute keys expected on each data point (besides thread attrs).
const commonHttpAttrs = [
  'http.request.method',
  'http.response.status_code',
  'network.protocol.version',
];
const clientOnlyAttrs = ['server.address'];
const serverOnlyAttrs = ['url.scheme'];

function getAttr(attributes, key) {
  return attributes.find((a) => a.key === key);
}

function checkExponentialHistogramDataPoint(name, dataPoint) {
  // Validate timestamps.
  const startTime = BigInt(dataPoint.startTimeUnixNano);
  assert.ok(startTime, `${name}: startTimeUnixNano should be set`);
  const time = BigInt(dataPoint.timeUnixNano);
  assert.ok(time, `${name}: timeUnixNano should be set`);
  assert.ok(time > startTime, `${name}: timeUnixNano > startTimeUnixNano`);

  // Validate attributes.
  validateArray(dataPoint.attributes, `${name}.attributes`);

  // Thread attributes.
  const threadIdAttr = getAttr(dataPoint.attributes, 'thread.id');
  assert.ok(threadIdAttr, `${name}: should have thread.id attribute`);
  assert.strictEqual(threadIdAttr.value.intValue, '0');
  const threadNameAttr = getAttr(dataPoint.attributes, 'thread.name');
  assert.ok(threadNameAttr, `${name}: should have thread.name attribute`);

  // Common HTTP semconv attributes.
  for (const key of commonHttpAttrs) {
    assert.ok(getAttr(dataPoint.attributes, key),
              `${name}: should have ${key} attribute`);
  }

  // Validate http.request.method value.
  const methodAttr = getAttr(dataPoint.attributes, 'http.request.method');
  assert.strictEqual(methodAttr.value.stringValue, 'GET',
                     `${name}: http.request.method should be GET`);

  // Validate http.response.status_code value.
  const statusAttr = getAttr(dataPoint.attributes, 'http.response.status_code');
  assert.strictEqual(statusAttr.value.intValue, '200',
                     `${name}: http.response.status_code should be 200`);

  // Validate network.protocol.version value.
  const versionAttr = getAttr(dataPoint.attributes, 'network.protocol.version');
  assert.strictEqual(versionAttr.value.stringValue, '1.1',
                     `${name}: network.protocol.version should be 1.1`);

  // Type-specific attributes.
  const isClient = name.includes('Client') || name.includes('client');
  if (isClient) {
    for (const key of clientOnlyAttrs) {
      assert.ok(getAttr(dataPoint.attributes, key),
                `${name}: client should have ${key} attribute`);
    }
    const addrAttr = getAttr(dataPoint.attributes, 'server.address');
    assert.strictEqual(addrAttr.value.stringValue, '127.0.0.1',
                       `${name}: server.address should be 127.0.0.1`);
  } else {
    for (const key of serverOnlyAttrs) {
      assert.ok(getAttr(dataPoint.attributes, key),
                `${name}: server should have ${key} attribute`);
    }
    const schemeAttr = getAttr(dataPoint.attributes, 'url.scheme');
    assert.strictEqual(schemeAttr.value.stringValue, 'http',
                       `${name}: url.scheme should be http`);
  }

  // Validate histogram fields: count, sum, scale.
  // count is a string (uint64 via proto longs: String).
  const count = parseInt(dataPoint.count, 10);
  assert.ok(count > 0, `${name}: count should be > 0, got ${count}`);

  // 'sum' should be present and > 0 (latency values are positive).
  validateNumber(dataPoint.sum, `${name}.sum`);
  assert.ok(dataPoint.sum > 0, `${name}: sum should be > 0`);

  // 'scale' should be a number.
  validateNumber(dataPoint.scale, `${name}.scale`);

  // 'positive' buckets should have data (latency is always positive).
  assert.ok(dataPoint.positive, `${name}: positive buckets should exist`);
  validateNumber(dataPoint.positive.offset, `${name}.positive.offset`);
  validateArray(dataPoint.positive.bucketCounts, `${name}.positive.bucketCounts`);
  assert.ok(dataPoint.positive.bucketCounts.length > 0, `${name}: positive.bucketCounts should not be empty`);

  // 'min' and 'max' should be present and > 0.
  validateNumber(dataPoint.min, `${name}.min`);
  assert.ok(dataPoint.min > 0, `${name}: min should be > 0`);
  validateNumber(dataPoint.max, `${name}.max`);
  assert.ok(dataPoint.max > 0, `${name}: max should be > 0`);
  assert.ok(dataPoint.max >= dataPoint.min, `${name}: max should be >= min`);
}

function checkHistogramMetrics(metricsData) {
  const resourceMetrics = metricsData.resourceMetrics;
  if (!resourceMetrics || resourceMetrics.length === 0) return null;

  const scopeMetrics = resourceMetrics[0].scopeMetrics;
  if (!scopeMetrics || scopeMetrics.length === 0) return null;

  const metrics = scopeMetrics[0].metrics;
  if (!metrics) return null;

  // Find all exponential histogram metrics with count > 0.
  const remaining = [...expectedHistograms];
  for (const metric of metrics) {
    if (metric.data !== 'exponentialHistogram') continue;

    const idx = remaining.findIndex((m) => m[0] === metric.name);
    if (idx === -1) continue;

    const [name, unit] = remaining[idx];
    assert.strictEqual(metric.unit, unit, `${name}: unit should be '${unit}'`);

    // Validate aggregation temporality (delta).
    assert.strictEqual(metric.exponentialHistogram.aggregationTemporality,
                       'AGGREGATION_TEMPORALITY_DELTA',
                       `${name}: should use delta temporality`);

    const dataPoints = metric.exponentialHistogram.dataPoints;
    validateArray(dataPoints, `${name}.dataPoints`);
    assert.ok(dataPoints.length > 0, `${name}: should have at least one data point`);

    // Find a data point with count > 0 (histogram has actual data).
    const dp = dataPoints.find((d) => parseInt(d.count, 10) > 0);
    if (dp) {
      checkExponentialHistogramDataPoint(name, dp);
      remaining.splice(idx, 1);
    }
  }

  return remaining.length === 0;
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
      await child.id();
      await child.config({ app: 'histogram_test' });

      // Fire 10 HTTP transactions to populate the histograms.
      const NUM_HTTP_TRANSACTIONS = 10;
      for (let i = 0; i < NUM_HTTP_TRANSACTIONS; i++) {
        await child.trace('http');
      }

      // Listen for metrics until we find exponential histograms with data.
      let shutdownCalled = false;
      grpcServer.on('metrics', mustCallAtLeast((data) => {
        if (shutdownCalled) return;
        const done = checkHistogramMetrics(data);
        if (done) {
          shutdownCalled = true;
          console.log('All exponential histograms validated');
          child.shutdown(0).then(() => {
            grpcServer.close();
            resolve();
          });
        }
      }, 1));
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
        NSOLID_INTERVAL: 1000,
      };
    },
  },
];

for (const testConfig of testConfigs) {
  await runTest(testConfig);
  console.log('Test passed!');
}
