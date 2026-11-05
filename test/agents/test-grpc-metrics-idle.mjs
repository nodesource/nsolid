// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fixtures from '../common/fixtures.js';
import { GRPCServer } from '../common/nsolid-grpc-agent/index.js';

const grpcServer = new GRPCServer();
const port = await new Promise((resolve) => {
  grpcServer.start(mustSucceed(resolve));
});

const firstValues = new Map();
const advanced = new Set();
let child;
let timeout;
try {
  const collected = new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('Idle observable collections did not advance'));
    }, 30000);
    grpcServer.on('metrics', (exported) => {
      const scope = exported.resourceMetrics[0].scopeMetrics.find(
        (item) => item.scope.name === 'idle-observables');
      const points = scope?.metrics.find((metric) =>
        metric.name === 'collections')?.gauge.dataPoints ?? [];
      for (const point of points) {
        const source = point.attributes.find((attribute) =>
          attribute.key === 'source')?.value.stringValue;
        if (source !== 'main' && source !== 'worker') continue;
        if (!firstValues.has(source)) {
          firstValues.set(source, point.asDouble);
        } else if (point.asDouble > firstValues.get(source)) {
          advanced.add(source);
        }
      }
      if (advanced.size === 2) resolve();
    });
  });
  child = fork(fixtures.path('nsolid-otel-metrics-idle.js'), [], {
    env: {
      ...process.env,
      NSOLID_GRPC: `localhost:${port}`,
      NSOLID_GRPC_INSECURE: '1',
      NSOLID_INTERVAL: '500',
    },
  });
  const exited = once(child, 'exit');
  await Promise.all([once(child, 'message'), collected]);
  clearTimeout(timeout);
  child.send('shutdown', mustSucceed());
  const [code, signal] = await exited;
  assert.strictEqual(code, 0);
  assert.strictEqual(signal, null);
  child = undefined;
} finally {
  clearTimeout(timeout);
  child?.kill();
  grpcServer.close();
}
