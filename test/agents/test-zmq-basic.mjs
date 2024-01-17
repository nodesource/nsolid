import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import {
  checkExitData,
  TestPlayground,
} from '../common/nsolid-zmq-agent/index.js';

const SIGTERM = 15;

const tests = [];

tests.push({
  name: 'should work if agent is killed with signal',
  test: async (playground) => {
    return new Promise((resolve) => {
      playground.bootstrap(mustSucceed(async (agentId) => {
        const exit = await playground.client.kill();
        assert.ok(exit);
        assert.strictEqual(exit.code, null);
        assert.strictEqual(exit.signal, 'SIGTERM');
        resolve();
      }), (eventType, agentId, data) => {
        assert.strictEqual(eventType, 'agent-exit');
        checkExitData(data, { exit_code: SIGTERM, error: null });
      });
    });
  },
});

tests.push({
  name: 'should work if agent exits gracefully without error',
  test: async (playground) => {
    return new Promise((resolve) => {
      playground.bootstrap(mustSucceed(async (agentId) => {
        const exit = await playground.client.shutdown(0);
        assert.ok(exit);
        assert.strictEqual(exit.code, 0);
        assert.strictEqual(exit.signal, null);
        resolve();
      }), mustCall((eventType, agentId, data) => {
        assert.strictEqual(eventType, 'agent-exit');
        checkExitData(data, { exit_code: 0, error: null });
      }));
    });
  },
});

tests.push({
  name: 'should work if agent exits gracefully with error code',
  test: async (playground) => {
    return new Promise((resolve) => {
      playground.bootstrap(mustSucceed(async (agentId) => {
        const exit = await playground.client.shutdown(1);
        assert.ok(exit);
        assert.strictEqual(exit.code, 1);
        assert.strictEqual(exit.signal, null);
        resolve();
      }), mustCall((eventType, agentId, data) => {
        assert.strictEqual(eventType, 'agent-exit');
        checkExitData(data, { exit_code: 1, error: null });
      }));
    });
  },
});

tests.push({
  name: 'should work if agent exits with exception',
  test: async (playground) => {
    return new Promise((resolve) => {
      playground.bootstrap(mustSucceed(async (agentId) => {
        const exit = await playground.client.exception('msg');
        assert.ok(exit);
        assert.strictEqual(exit.code, 1);
        assert.strictEqual(exit.signal, null);
        resolve();
      }), mustCall((eventType, agentId, data) => {
        assert.strictEqual(eventType, 'agent-exit');
        assert.strictEqual(data.exit_code, 1);
        assert.strictEqual(data.error.code, 500);
        assert.strictEqual(data.error.message, 'Uncaught Error: error');
        assert.ok(data.error.stack);
      }));
    });
  },
});

const config = {
  commandBindAddr: 'tcp://*:9001',
  dataBindAddr: 'tcp://*:9002',
  bulkBindAddr: 'tcp://*:9003',
  HWM: 0,
  bulkHWM: 0,
  commandTimeoutMilliseconds: 5000,
};

for (const saas of [false, true]) {
  config.saas = saas;
  const label = saas ? 'saas' : 'local';
  const playground = new TestPlayground(config);
  await playground.startServer();

  for (const { name, test } of tests) {
    console.log(`[${label}] basic bootstrap and exit ${name}`);
    await test(playground);
    await playground.stopClient();
  }

  await playground.stopServer();
}
