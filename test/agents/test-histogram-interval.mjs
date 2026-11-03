// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import nsolid from 'nsolid';
import binding from 'internal/test/binding';
import { GRPCServer } from '../common/nsolid-grpc-agent/index.js';

const { internalBinding } = binding;

if (process.argv[2] === 'child') {
  const binding = internalBinding('nsolid_api');
  process.on('message', mustCall(async (value) => {
    if (value === 'exit') process.exit(0);
    if (value === 456) {
      binding.updateConfig(JSON.stringify({ interval: 0, tags: ['invalid'] }));
      assert.strictEqual(nsolid.config.interval, 50);
      binding.updateConfig(JSON.stringify({ interval: 50 }));
    } else if (value === 789) {
      nsolid.start({ interval: 3600000 });
      await delay(250);
      binding.updateConfig(JSON.stringify({ interval: 50 }));
      assert.strictEqual(nsolid.config.interval, 50);
    }
    binding.pushDnsBucket(value, `interval-${value}.test`, '');
  }, 4));
  process.send('ready');
} else {
  const server = new GRPCServer();
  const port = await new Promise((resolve) => server.start(mustSucceed(resolve)));
  const seen = new Set();
  server.on('metrics', (data) => {
    for (const resource of data.resourceMetrics || []) {
      for (const scope of resource.scopeMetrics || []) {
        for (const metric of scope.metrics || []) {
          if (metric.name !== 'dns.lookup.duration') continue;
          for (const point of metric.exponentialHistogram.dataPoints) {
            const name = point.attributes.find(({ key }) => key === 'dns.question.name');
            if (name) seen.add(name.value.stringValue);
          }
        }
      }
    }
  });
  const child = fork(new URL(import.meta.url), ['child'], {
    env: { NSOLID_GRPC: `localhost:${port}`, NSOLID_GRPC_INSECURE: 1,
           NSOLID_INTERVAL: 50 },
  });
  try {
    const [message] = await once(child, 'message');
    assert.strictEqual(message, 'ready');
    for (const value of [123, 456, 789]) {
      child.send(value);
      const deadline = Date.now() + 10000;
      while (!seen.has(`interval-${value}.test`)) {
        assert.ok(Date.now() < deadline, `histogram timer stopped at ${value}`);
        await delay(50);
      }
    }
    child.send('exit');
    const [code] = await once(child, 'exit');
    assert.strictEqual(code, 0);
  } finally {
    if (child.exitCode === null) child.kill();
    server.close();
  }
}
