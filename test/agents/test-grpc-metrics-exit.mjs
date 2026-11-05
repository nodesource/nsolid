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
const exports = [];
grpcServer.on('metrics', (metrics) => exports.push(metrics));

try {
  for (const mode of [ 'natural', 'explicit', 'disabled' ]) {
    const start = exports.length;
    const child = fork(fixtures.path('nsolid-otel-metrics-exit.js'), [mode], {
      env: {
        ...process.env,
        NSOLID_GRPC: `localhost:${port}`,
        NSOLID_GRPC_INSECURE: '1',
        NSOLID_INTERVAL: '500',
      },
    });
    let timeout;
    try {
      const pending = new Set();
      let ready;
      let workerExit;
      const started = new Promise((resolve) => { ready = resolve; });
      const workerExited = new Promise((resolve) => { workerExit = resolve; });
      child.on('message', (message) => {
        if (message.type === 'pending') {
          pending.add(message.source);
          if (pending.size === 2) ready();
        } else if (message.type === 'worker_exit') {
          workerExit(message.code);
        }
      });
      const processExited = once(child, 'exit');
      const agentExited = once(grpcServer, 'exit');
      const exercise = async () => {
        await started;
        child.send({ type: 'finish_worker' });
        const workerCode = await workerExited;
        child.send({ type: 'finish_main' });
        const [[code, signal]] = await Promise.all([processExited, agentExited]);
        return { workerCode, code, signal };
      };
      const { workerCode, code, signal } = await Promise.race([
        exercise(),
        new Promise((resolve, reject) => {
          timeout = setTimeout(() => reject(new Error(`Exit timed out: ${mode}`)),
                               30000);
        }),
      ]);
      assert.strictEqual(workerCode, 0);
      assert.strictEqual(code, 0);
      assert.strictEqual(signal, null);

      const metrics = exports.slice(start).flatMap((exported) =>
        exported.resourceMetrics[0].scopeMetrics.filter((scope) =>
          scope.scope.name === 'shutdown-metrics')
          .flatMap((scope) => scope.metrics));
      assert.ok(!metrics.some((metric) => metric.name === 'partial'));
      if (mode === 'disabled') {
        assert.deepStrictEqual(metrics, []);
        continue;
      }
      for (const source of [ 'main', 'worker' ]) {
        const pointFor = (name) => metrics.filter((metric) => metric.name === name)
          .flatMap((metric) => metric[metric.data].dataPoints)
          .findLast((point) => point.attributes.some((attribute) =>
            attribute.key === 'source' && attribute.value.stringValue === source));
        const counter = pointFor('requests');
        assert.ok(counter, `Missing final ${source} counter for ${mode}`);
        assert.strictEqual(counter.asDouble, 3);
        assert.strictEqual(pointFor('active').asDouble, 3);
        assert.strictEqual(pointFor('temperature').asDouble, 7);
        const histogram = pointFor('duration');
        assert.strictEqual(histogram.count, '2');
        assert.strictEqual(histogram.sum, 6);
        assert.strictEqual(histogram.min, 2);
        assert.strictEqual(histogram.max, 4);
        assert.strictEqual(histogram.timeUnixNano, counter.timeUnixNano);
        assert.ok(BigInt(counter.timeUnixNano) > 0n);
      }
      const counter = metrics.find((metric) => metric.name === 'requests');
      assert.strictEqual(counter.unit, '1');
      assert.strictEqual(counter.description, 'Final counter');
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null) child.kill();
    }
  }
} finally {
  grpcServer.close();
}
