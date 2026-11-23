// Flags: --expose-internals
import { mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { once } from 'node:events';
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
  const ids = new Set();
  for (let i = 0; i < 3; i++) {
    for (const [type, command] of [
      ['profile', 'profile'],
      ['heapProfile', 'heap_profile'],
      ['heapSampling', 'heap_sampling'],
      ['snapshot', 'snapshot'],
    ]) {
      let profileData = '';
      let requestId;
      const onPacket = mustCallAtLeast((id, { metadata, packet }) => {
        assert.strictEqual(id, agentId);
        assert.strictEqual(metadata.command, command);
        requestId ??= metadata.requestId;
        assert.strictEqual(metadata.requestId, requestId);
        profileData += packet;
      });
      bus.on('asset-data-packet', onPacket);
      const received = once(bus, 'asset-received');
      await playground.client.profileRegistration(type, defer);
      const [id, metadata] = await received;
      bus.removeListener('asset-data-packet', onPacket);
      assert.strictEqual(id, agentId);
      assert.strictEqual(metadata.command, command);
      assert.strictEqual(metadata.complete, true);
      assert.strictEqual(metadata.requestId, requestId);
      assert.ok(!ids.has(requestId));
      ids.add(requestId);
      const profile = JSON.parse(profileData);
      if (type === 'profile') {
        assert.ok(Array.isArray(profile.nodes));
      } else if (type === 'heapSampling') {
        assert.ok(profile.head);
      } else {
        assert.ok(Array.isArray(profile.nodes));
        assert.ok(Array.isArray(profile.edges));
        assert.ok(profile.snapshot.node_count > 0);
      }
    }
  }
  await playground.stopClient();
}
await playground.stopServer();
