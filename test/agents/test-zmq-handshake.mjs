import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import {
  checkExitData,
  TestPlayground,
} from '../common/nsolid-zmq-agent/index.js';

const tests = [];

function testHandshakeGracefulExit(playground) {
  return new Promise((resolve) => {
    const state = {
      id: null,
      events: 0,
      authCount: 0,
    };

    async function onInitialSequence(err) {
      assert.ifError(err);
      const exit = await playground.client.shutdown(0);
      assert.ok(exit);
      assert.strictEqual(exit.code, 0);
      assert.strictEqual(exit.signal, null);
      resolve();
    }

    function onExit(eventType, agentId, data) {
      assert.strictEqual(eventType, 'agent-exit');
      checkExitData(data, { exit_code: 0, error: null });
    }

    function onEvent(eventType, agentId, data) {
      playground.detectInitialSequence(state, eventType, data, agentId,
                                       onInitialSequence, onExit);
    }

    playground.bootstrap(mustSucceed(async (agentId) => {
      await playground.stopServer();
      playground.updateConfig({
        dataBindAddr: 'tcp://*:9004',
        bulkBindAddr: 'tcp://*:9005',
      });

      await playground.startServer();
    }), onEvent);
  });
}

tests.push({
  name: 'should work if agent exits gracefully without error',
  test: testHandshakeGracefulExit,
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
  console.log(`[local] zmq handshake ${name}`);
  await test(playground);
  await playground.stopClient();
}

await playground.stopServer();
