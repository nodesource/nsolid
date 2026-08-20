import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import {
  checkExitData,
  TestPlayground,
} from '../common/nsolid-zmq-agent/index.js';

const SIGTERM = 15;

const tests = [];

function testKilledWithSignal(playground) {
  let state = 0;
  return new Promise((resolve) => {
    playground.bootstrap(mustSucceed(async (agentId) => {
      const exit = await playground.client.kill();
      assert.ok(exit);
      assert.strictEqual(exit.code, null);
      assert.strictEqual(exit.signal, 'SIGTERM');
      if (++state === 2) {
        resolve();
      }
    }), mustCall((eventType, agentId, data) => {
      assert.strictEqual(eventType, 'agent-exit');
      checkExitData(data, { exit_code: SIGTERM, error: null });
      if (++state === 2) {
        resolve();
      }
    }));
  });
}

function testGracefulExitNoError(playground) {
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
}

function testGracefulExitWithError(playground) {
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
}

function testExitWithException(playground) {
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
}

tests.push({
  name: 'should work if agent is killed with signal',
  test: testKilledWithSignal,
});

tests.push({
  name: 'should work if agent exits gracefully without error',
  test: testGracefulExitNoError,
});

tests.push({
  name: 'should work if agent exits gracefully with error code',
  test: testGracefulExitWithError,
});

tests.push({
  name: 'should work if agent exits with exception',
  test: testExitWithException,
});

const config = {
  commandBindAddr: 'tcp://*:9001',
  dataBindAddr: 'tcp://*:9002',
  bulkBindAddr: 'tcp://*:9003',
  HWM: 0,
  bulkHWM: 0,
  commandTimeoutMilliseconds: 5000,
  saas: false,
};

const playground = new TestPlayground(config);
await playground.startServer();

for (const { name, test } of tests) {
  console.log(`[local] basic bootstrap and exit ${name}`);
  await test(playground);
  await playground.stopClient();
}

await playground.stopServer();
