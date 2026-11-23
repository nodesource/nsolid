// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { once } from 'node:events';
import { GRPCServer, TestClient } from '../common/nsolid-grpc-agent/index.js';

// Deferring the start callback forces the collector to process results first.
for (const defer of [false, true]) {
  const server = new GRPCServer();
  const port = await new Promise((resolve) => server.start(mustSucceed(resolve)));
  const connected = once(server, 'command');
  const child = new TestClient([], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: { NSOLID_GRPC: `localhost:${port}`, NSOLID_GRPC_INSECURE: 1,
           NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 },
  });
  await child.id();
  await connected;
  const ids = new Set();
  for (let i = 0; i < 3; i++) {
    for (const [type, command] of [
      ['profile', 'profile'],
      ['heapProfile', 'heap_profile'],
      ['heapSampling', 'heap_sampling'],
      ['snapshot', 'snapshot'],
    ]) {
      const received = once(server, command);
      await child.profileRegistration(type, defer);
      const [{ msg }] = await received;
      assert.strictEqual(msg.common.error, null);
      assert.strictEqual(msg.threadId, '0');
      assert.notStrictEqual(msg.duration, null); // Set only by a complete packet.
      assert.ok(!ids.has(msg.common.requestId));
      ids.add(msg.common.requestId);
      const profile = JSON.parse(msg.data);
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
  const exit = await child.shutdown(0);
  assert.strictEqual(exit.code, 0);
  assert.strictEqual(exit.signal, null);
  await server.close();
}
