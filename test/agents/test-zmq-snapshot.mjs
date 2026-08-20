import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { TestPlayground } from '../common/nsolid-zmq-agent/index.js';

/**
 * data has this format:
 * {
    agentId: '1a3ff062d4c016000bd4a8bd33f22c002d6ed6b3',
    requestId: '5625b2d3-55b7-4660-84d1-5ad6f003f933',
    command: 'snapshot',
    metadata: { reason: 'unspecified' },
    complete: false,
    threadId: 0,
    version: 4,
    bulkId: '5625b2d3-55b7-4660-84d1-5ad6f003f933'
  }
 */
function checkSnapshotData(requestId, options, agentId, data, complete) {
  assert.strictEqual(data.requestId, requestId);
  assert.strictEqual(data.agentId, agentId);
  assert.strictEqual(data.app, 'untitled application');
  assert.strictEqual(data.command, 'snapshot');
  assert.strictEqual(data.complete, complete);
  assert.strictEqual(data.threadId, options.threadId);
  assert.strictEqual(data.version, 4);
  assert.strictEqual(data.bulkId, requestId);
}

const tests = [];

function testMainThreadSnapshot(playground) {
  return new Promise((resolve) => {
    let events = 0;
    let requestId;
    let snapshot = '';
    const options = {
      threadId: 0,
    };

    const bootstrapOpts = {
      opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 } },
    };

    function onEvent(eventType, agentId, data) {
      switch (++events) {
        case 1:
          assert.strictEqual(eventType, 'asset-data-packet');
          if (data.packet.length > 0) {
            checkSnapshotData(requestId, options, agentId, data.metadata, false);
            snapshot += data.packet;
            --events;
          } else {
            checkSnapshotData(requestId, options, agentId, data.metadata, true);
          }
          break;
        case 2:
          assert.strictEqual(eventType, 'asset-received');
          checkSnapshotData(requestId, options, agentId, data, true);
          JSON.parse(snapshot);
          resolve();
      }
    }

    playground.bootstrap(bootstrapOpts, mustSucceed((agentId) => {
      requestId = playground.zmqAgentBus.agentSnapshotRequest(agentId, options);
    }), onEvent);
  });
}

function testWorkerThreadSnapshot(playground) {
  return new Promise((resolve) => {
    let events = 0;
    let requestId;
    let snapshot = '';
    const options = {};

    const bootstrapOpts = {
      args: [ '-w', 1 ],
      opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 } },
    };

    function onEvent(eventType, agentId, data) {
      switch (++events) {
        case 1:
          assert.strictEqual(eventType, 'asset-data-packet');
          if (data.packet.length > 0) {
            checkSnapshotData(requestId, options, agentId, data.metadata, false);
            snapshot += data.packet;
            --events;
          } else {
            checkSnapshotData(requestId, options, agentId, data.metadata, true);
          }
          break;
        case 2:
          assert.strictEqual(eventType, 'asset-received');
          checkSnapshotData(requestId, options, agentId, data, true);
          JSON.parse(snapshot);
          resolve();
      }
    }

    playground.bootstrap(bootstrapOpts, mustSucceed(async (agentId) => {
      const workers = await playground.client.workers();
      options.threadId = workers[0];
      requestId = playground.zmqAgentBus.agentSnapshotRequest(agentId, options);
    }), onEvent);
  });
}

function testMissingThread(playground) {
  return new Promise((resolve) => {
    const options = {
      threadId: 10,
    };

    playground.bootstrap(mustSucceed((agentId) => {
      playground.zmqAgentBus.agentSnapshotRequest(agentId, options, mustCall((err) => {
        assert.strictEqual(err.code, 410);
        assert.strictEqual(err.message, 'Thread already gone');
        resolve();
      }));
    }));
  });
}

function testInvalidThreadId(playground) {
  return new Promise((resolve) => {
    const options = {
      threadId: 'wth',
    };

    playground.bootstrap(mustSucceed((agentId) => {
      playground.zmqAgentBus.agentSnapshotRequest(agentId, options, mustCall((err) => {
        assert.strictEqual(err.code, 422);
        assert.strictEqual(err.message, 'Invalid arguments');
        resolve();
      }));
    }));
  });
}

function testDisabledSnapshots(playground) {
  return new Promise((resolve) => {
    const options = {
      threadId: 0,
    };

    const bootstrapOpts = {
      opts: { env: { NSOLID_DISABLE_SNAPSHOTS: 1 } },
    };

    playground.bootstrap(bootstrapOpts, mustSucceed((agentId) => {
      playground.zmqAgentBus.agentSnapshotRequest(agentId, options, mustCall((err) => {
        assert.strictEqual(err.code, 422);
        assert.strictEqual(err.message, 'Invalid arguments');
        resolve();
      }));
    }));
  });
}

function testNullArgs(playground) {
  return new Promise((resolve) => {
    const options = null;

    playground.bootstrap(mustSucceed((agentId) => {
      playground.zmqAgentBus.agentSnapshotRequest(agentId, options, mustCall((err) => {
        assert.strictEqual(err.code, 422);
        assert.strictEqual(err.message, 'Invalid arguments');
        resolve();
      }));
    }));
  });
}

function testSnapshotAlreadyRunning(playground) {
  return new Promise((resolve) => {
    let events = 0;
    let requestId;
    const options = {
      threadId: 0,
    };

    const bootstrapOpts = {
      opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 } },
    };

    function onEvent(eventType, agentId, data) {
      switch (++events) {
        case 1:
          assert.strictEqual(eventType, 'asset-data-packet');
          if (data.packet.length > 0) {
            checkSnapshotData(requestId, options, agentId, data.metadata, false);
            --events;
          } else {
            checkSnapshotData(requestId, options, agentId, data.metadata, true);
          }
          break;
        case 2:
          assert.strictEqual(eventType, 'asset-received');
          checkSnapshotData(requestId, options, agentId, data, true);
          resolve();
      }
    }

    playground.bootstrap(bootstrapOpts, mustSucceed((agentId) => {
      requestId = playground.zmqAgentBus.agentSnapshotRequest(agentId, options);
      playground.zmqAgentBus.agentSnapshotRequest(agentId, options, mustCall((err) => {
        assert.strictEqual(err.code, 409);
        assert.strictEqual(err.message, 'Snapshot already in progress');
      }));
    }), onEvent);
  });
}

function testAssetsEnabledToggle(playground) {
  return new Promise((resolve) => {
    let events = 0;
    let snapshot = '';
    let requestId;
    let resolved = false;
    const options = {
      threadId: 0,
    };

    const bootstrapOpts = {
      opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 } },
    };

    async function onEvent(eventType, agentId, data) {
      if (resolved)
        return;

      switch (++events) {
        case 1:
          assert.strictEqual(eventType, 'asset-data-packet');
          if (data.packet.length > 0) {
            checkSnapshotData(requestId, options, agentId, data.metadata, false);
            snapshot += data.packet;
            --events;
          } else {
            checkSnapshotData(requestId, options, agentId, data.metadata, true);
          }
          break;
        case 2: {
          assert.strictEqual(eventType, 'asset-received');
          checkSnapshotData(requestId, options, agentId, data, true);
          JSON.parse(snapshot);
          resolved = true;
          const currentConfig = await playground.client.config();
          assert.strictEqual(currentConfig.assetsEnabled, true);
          resolve();
        }
      }
    }

    playground.bootstrap(bootstrapOpts, mustSucceed(async (agentId) => {
      const disabledConfig = await playground.client.config({ assetsEnabled: false });
      assert.strictEqual(disabledConfig.assetsEnabled, false);

      await new Promise((done) => {
        playground.zmqAgentBus.agentSnapshotRequest(agentId, options, mustCall((err) => {
          assert.strictEqual(err.code, 422);
          assert.strictEqual(err.message, 'Invalid arguments');
          done();
        }));
      });

      const enabledConfig = await playground.client.config({ assetsEnabled: true });
      assert.strictEqual(enabledConfig.assetsEnabled, true);

      requestId = playground.zmqAgentBus.agentSnapshotRequest(agentId, options);
    }), onEvent);
  });
}

tests.push({
  name: 'should work for the main thread',
  test: testMainThreadSnapshot,
});

tests.push({
  name: 'should work for worker threads',
  test: testWorkerThreadSnapshot,
});

tests.push({
  name: 'should return 410 if sent to a non-existant thread',
  test: testMissingThread,
});

tests.push({
  name: 'should return 422 if invalid threadId field',
  test: testInvalidThreadId,
});

tests.push({
  name: 'should return 422 if invalid disableSnapshots config',
  test: testDisabledSnapshots,
});

tests.push({
  name: 'should return 422 no args field',
  test: testNullArgs,
});

tests.push({
  name: 'should return 409 if snapshot in progress',
  test: testSnapshotAlreadyRunning,
});

tests.push({
  name: 'should respect assetsEnabled toggled via nsolid.start()',
  test: testAssetsEnabledToggle,
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
  console.log(`[local] snapshot command ${name}`);
  await test(playground);
  await playground.stopClient();
}

await playground.stopServer();
