import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { TestPlayground } from '../common/nsolid-zmq-agent/index.js';

function checkRedacted(data, redacted) {
  const { snapshot, nodes, strings } = JSON.parse(data);
  const fields = snapshot.meta.node_fields;
  const typeIndex = fields.indexOf('type');
  const nameIndex = fields.indexOf('name');
  const stringType = snapshot.meta.node_types[typeIndex].indexOf('string');
  let stringCount = 0;
  let redactedCount = 0;
  for (let i = 0; i < nodes.length; i += fields.length) {
    if (nodes[i + typeIndex] === stringType) {
      stringCount++;
      if (strings[nodes[i + nameIndex]] === '(redacted)') {
        redactedCount++;
      }
    }
  }
  assert.ok(stringCount > 0);
  if (redacted) {
    assert.strictEqual(redactedCount, stringCount);
  } else {
    assert.ok(redactedCount < stringCount);
  }
}

const playground = new TestPlayground({
  commandBindAddr: 'tcp://*:9001',
  dataBindAddr: 'tcp://*:9002',
  bulkBindAddr: 'tcp://*:9003',
  HWM: 0,
  bulkHWM: 0,
  commandTimeoutMilliseconds: 5000,
  saas: false,
});
await playground.startServer();

for (const type of ['snapshot', 'heap_profile']) {
  await new Promise((resolve) => {
    let profile = '';
    const options = {
      opts: {
        env: {
          NSOLID_ASSETS_ENABLED: '0',
          NSOLID_REDACT_SNAPSHOTS: '0',
          NSOLID_BLOCKED_LOOP_THRESHOLD: '10000',
        },
      },
    };
    playground.bootstrap(options, mustSucceed(() => {
      // Apply config and request collection in the same child message handler.
      playground.client.child().send({
        type,
        duration: 100,
        config: { assetsEnabled: true, redactSnapshots: true },
      });
    }), (event, agentId, data) => {
      if (event === 'asset-data-packet') {
        profile += data.packet;
      } else if (event === 'asset-received') {
        checkRedacted(profile, true);
        resolve();
      }
    });
  });
  await playground.stopClient();
}

await playground.stopServer();
