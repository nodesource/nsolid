// Flags: --expose-internals
import { mustCall, mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import nsolid from 'nsolid';
import binding from 'internal/test/binding';
import { OTLPGRPCServer, OTLPServer } from '../common/nsolid-otlp-agent/index.js';

const { internalBinding } = binding;

if (process.argv[2] === 'child') {
  nsolid.start({ tracingEnabled: false });
  process.on('message', mustCall((message) => {
    if (message === 'exit') process.exit(0);
    assert.strictEqual(message, 'run');
    internalBinding('nsolid_api').pushDnsBucket(1500, 'batching.test', '');
  }, 2));
  process.send('ready');
} else {
  for (const protocol of ['grpc', 'http']) {
    const server = protocol === 'grpc' ? new OTLPGRPCServer() : new OTLPServer();
    const port = await new Promise((resolve) => server.start(mustSucceed(resolve)));
    const timeout = setTimeout(() => assert.fail(`${protocol}: no histogram batch`), 15000);
    const threadMetrics = once(server, 'thread-metrics');
    const batch = once(server, 'batch');
    server.on('metrics', mustCallAtLeast((data) => {
      for (const resource of data.resourceMetrics || []) {
        for (const scope of resource.scopeMetrics || []) {
          const scalar = scope.metrics.find(({ name }) => name === 'used_heap_size');
          if (scalar) server.emit('thread-metrics');
          const histogram = scope.metrics.find(({ name }) => name === 'dns.lookup.duration');
          for (const point of histogram?.exponentialHistogram.dataPoints || []) {
            if (!point.attributes.some(({ key, value }) =>
              key === 'dns.question.name' && value.stringValue === 'batching.test')) continue;
            assert.ok(scalar, 'histograms must share the thread metrics export');
            assert.strictEqual(Number(point.count), 1);
            assert.strictEqual(point.sum, 1.5);
            server.emit('batch');
          }
        }
      }
    }));
    const child = fork(new URL(import.meta.url), ['child'], {
      env: {
        NSOLID_INTERVAL: 100,
        NSOLID_OTLP: 'otlp',
        NSOLID_OTLP_CONFIG: JSON.stringify({
          url: `http://localhost:${port}`,
          protocol,
        }),
      },
    });
    try {
      const [[message]] = await Promise.all([once(child, 'message'), threadMetrics]);
      assert.strictEqual(message, 'ready');
      child.send('run');
      await batch;
      child.send('exit');
      const [code] = await once(child, 'exit');
      assert.strictEqual(code, 0);
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null) child.kill();
      server.close();
    }
  }
}
