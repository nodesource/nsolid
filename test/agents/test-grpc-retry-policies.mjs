// Flags: --expose-internals
// The custom harness awaits each async scenario directly.
/* eslint node-core/must-call-assert: off */

import { mustCall, mustNotCall, mustSucceed } from '../common/index.mjs';
import { GRPCServer, TestClient } from '../common/nsolid-grpc-agent/index.js';

import assert from 'node:assert';
import { once } from 'node:events';

const services = [
  { name: 'ExportInfo', trigger: (client, s, id) => s.info(id), event: 'info' },
  { name: 'ExportMetricsCmd', trigger: (client, s, id) => s.metrics(id), event: 'metrics_cmd' },
  { name: 'ExportSpans', trigger: (client, s, id) => client.trace('http'), event: 'spans' },
];

const tests = [];

function waitForAttempt(server, service, total) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.off('attempt', onAttempt);
      reject(new Error(`Timed out waiting for ${service} attempt ${total}`));
    }, 30000);
    const onAttempt = (attempt) => {
      if (attempt.service !== service || attempt.total !== total) return;
      clearTimeout(timeout);
      server.off('attempt', onAttempt);
      resolve(attempt);
    };
    server.on('attempt', onAttempt);
  });
}

function waitForFault(server, service, total) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.off('fault', onFault);
      reject(new Error(`Timed out waiting for ${service} status ${total}`));
    }, 30000);
    const onFault = (fault) => {
      if (fault.service !== service || fault.total !== total) return;
      clearTimeout(timeout);
      server.off('fault', onFault);
      resolve(fault);
    };
    server.on('fault', onFault);
  });
}

async function withRetryAgent(getEnv, run) {
  const grpcServer = new GRPCServer();
  let client;
  try {
    const port = await new Promise((resolve) =>
      grpcServer.start(mustSucceed(resolve)));
    const commandReady = once(grpcServer, 'command');
    client = new TestClient([], { env: getEnv(port) });
    const agentId = await client.id();
    await commandReady;
    await run(grpcServer, client, agentId);
  } finally {
    grpcServer.clearFaults();
    if (client) await client.shutdown(0);
    grpcServer.close();
  }
}

tests.push({
  name: 'should retry on transient UNAVAILABLE and succeed',
  test: (getEnv) => withRetryAgent(getEnv, async (grpcServer, client, agentId) => {
    const results = await Promise.all(services.map(async (svc) => {
      const attempts = Promise.all([
        waitForAttempt(grpcServer, svc.name, 1),
        waitForAttempt(grpcServer, svc.name, 2),
      ]);
      grpcServer.injectFailure(svc.name, 'UNAVAILABLE', 1);

      let data;
      if (svc.name === 'ExportSpans') {
        const upload = once(grpcServer, svc.event);
        await client.trace('http');
        [data] = await upload;
      } else {
        ({ data } = await svc.trigger(client, grpcServer, agentId));
      }

      const [, retry] = await attempts;
      return { svc, retry, attemptsHeader: data.metadata['grpc-previous-rpc-attempts'] };
    }));
    for (const { svc, retry, attemptsHeader } of results) {
      assert.strictEqual(retry.lastPreviousRpcAttempts, 1);
      assert(attemptsHeader && attemptsHeader[0] === '1',
             `Should have retried once for ${svc.name}, got ${attemptsHeader}`);
    }
  }).then(mustCall()),
});

tests.push({
  name: 'should fail after max retries (5) on persistent UNAVAILABLE',
  test: (getEnv) => withRetryAgent(getEnv, async (grpcServer, client, agentId) => {
    const results = await Promise.all(services.map(async (svc) => {
      grpcServer.injectFailure(svc.name, 'UNAVAILABLE', 20);
      const fifthAttempt = waitForAttempt(grpcServer, svc.name, 5);
      const finalFault = waitForFault(grpcServer, svc.name, 5);
      let succeeded = false;
      let sixthAttempt = false;
      const onAttempt = (attempt) => {
        if (attempt.service === svc.name && attempt.total > 5) sixthAttempt = true;
      };
      grpcServer.on('attempt', onAttempt);

      if (svc.name === 'ExportSpans') {
        grpcServer.on(svc.event, () => { succeeded = true; });
        await client.trace('http');
      } else {
        svc.trigger(client, grpcServer, agentId).then(
          mustNotCall('expected never settling promise'));
      }

      const [attempt, fault] = await Promise.all([fifthAttempt, finalFault]);
      // Keep guards active after the last injected fault: the client may still
      // retry or deliver a successful export asynchronously.
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10000));
      grpcServer.off('attempt', onAttempt);
      return { svc, attempt, fault, succeeded, sixthAttempt };
    }));
    for (const { svc, attempt, fault, succeeded, sixthAttempt } of results) {
      assert.strictEqual(fault.status, 'UNAVAILABLE');
      assert.strictEqual(attempt.lastPreviousRpcAttempts, 4);
      assert.strictEqual(sixthAttempt, false, `${svc.name} made a sixth attempt`);
      assert.strictEqual(succeeded, false, `${svc.name} unexpectedly succeeded`);
    }
  }).then(mustCall()),
});

tests.push({
  name: 'should retry DEADLINE_EXCEEDED only for OTLP',
  test: (getEnv) => withRetryAgent(getEnv, async (grpcServer, client, agentId) => {
    const checks = services.filter((svc) => svc.name !== 'ExportSpans').map(async (svc) => {
      const firstAttempt = waitForAttempt(grpcServer, svc.name, 1);
      let retried = false;
      const onAttempt = (attempt) => {
        if (attempt.service === svc.name && attempt.total > 1) retried = true;
      };
      grpcServer.on('attempt', onAttempt);
      grpcServer.injectFailure(svc.name, 'DEADLINE_EXCEEDED', 1);
      svc.trigger(client, grpcServer, agentId).then(
        mustNotCall('expected never settling promise'));

      const first = await firstAttempt;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10000));
      grpcServer.off('attempt', onAttempt);
      return { svc, first, retried };
    });

    const spansAttempt = waitForAttempt(grpcServer, 'ExportSpans', 2);
    const spansExport = once(grpcServer, 'spans');
    grpcServer.injectFailure('ExportSpans', 'DEADLINE_EXCEEDED', 1);
    const traces = client.trace('http');
    const [attempt, [data]] = await Promise.all([
      spansAttempt,
      spansExport,
      traces,
    ]);
    const results = await Promise.all(checks);
    for (const { svc, first, retried } of results) {
      assert.strictEqual(first.lastPreviousRpcAttempts, 0);
      assert.strictEqual(retried, false, `Should not retry ${svc.name}`);
    }
    assert.strictEqual(attempt.lastPreviousRpcAttempts, 1);
    assert.strictEqual(data.metadata['grpc-previous-rpc-attempts'][0], '1');
  }).then(mustCall()),
});

const testConfigs = [
  {
    getEnv: (port) => ({
      NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
      NSOLID_GRPC: `localhost:${port}`,
      NSOLID_GRPC_INSECURE: 1,
      NSOLID_TRACING_ENABLED: 1,
    }),
  },
];

for (const testConfig of testConfigs) {
  for (const { name, test } of tests) {
    console.log(`[retry-policies] ${name}`);
    await test(testConfig.getEnv);
  }
}
