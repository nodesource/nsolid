// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { TestPlayground } from '../common/nsolid-zmq-agent/index.js';

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
for (const defer of [false, true]) {
  const agentId = await new Promise((resolve) => {
    playground.bootstrap({ args: [] }, mustSucceed(resolve));
  });
  const bus = playground.zmqAgentBus;
  const assets = new Map();
  const complete = new Set();
  const count = 3;
  const received = new Promise((resolve) => {
    bus.on('asset-received', mustCall((id, metadata) => {
      assert.strictEqual(id, agentId);
      assert.strictEqual(metadata.command, 'snapshot');
      assert.strictEqual(metadata.complete, true);
      assert.ok(!complete.has(metadata.requestId));
      const { data, chunks } = assets.get(metadata.requestId);
      assert.ok(chunks > 1);
      const snapshot = JSON.parse(data);
      assert.ok(snapshot.snapshot.node_count > 100_000);
      assert.ok(Array.isArray(snapshot.nodes));
      assert.ok(Array.isArray(snapshot.edges));
      complete.add(metadata.requestId);
      if (complete.size === count) resolve();
    }, count));
  });
  const onPacket = (id, { metadata, packet }) => {
    let asset = assets.get(metadata.requestId);
    if (!asset) {
      asset = { data: '', chunks: 0 };
      assets.set(metadata.requestId, asset);
    }
    asset.data += packet;
    if (packet.length > 0) asset.chunks++;
  };
  bus.on('asset-data-packet', onPacket);
  await playground.client.snapshotBurst(count, defer);
  await received;
  bus.removeListener('asset-data-packet', onPacket);
  assert.strictEqual(assets.size, count);
  await playground.stopClient();
}
await playground.stopServer();
