// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import {
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

// A heap snapshot isn't counted among the profiles in progress, so its end
// must not be taken off them either: the count wrapped, and an exit with a
// profile running (always, with continuous profiling on) waited forever.
async function runTest(getEnv) {
  return new Promise((resolve) => {
    const grpcServer = new GRPCServer();
    grpcServer.start(mustSucceed(async (port) => {
      const opts = {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: getEnv(port),
      };
      // Commands need the agent's command stream up.
      const connected = new Promise((r) => grpcServer.once('command', r));
      const child = new TestClient([], opts);
      const agentId = await child.id();
      await connected;
      await grpcServer.heapSnapshot(agentId, { threadId: 0 });
      await grpcServer.reconfigure(agentId, { contCpuProfile: true });
      const start = Date.now();
      let timer;
      const exit = await Promise.race([
        child.shutdown(0),
        new Promise((r) => { timer = setTimeout(() => r({ hung: true }), 30_000); }),
      ]);
      clearTimeout(timer);
      assert.ok(!exit.hung, `the process didn't exit within 30 s (${Date.now() - start} ms)`);
      assert.strictEqual(exit.code, 0);
      grpcServer.close();
      resolve();
    }));
  });
}

const testConfigs = [
  {
    getEnv: (port) => ({
      NSOLID_GRPC_INSECURE: 1,
      NSOLID_GRPC: `localhost:${port}`,
    }),
  },
  {
    getEnv: (port) => ({
      NSOLID_GRPC_INSECURE: 1,
      NSOLID_SAAS: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbtesting.localhost:${port}`,
    }),
  },
];

for (const testConfig of testConfigs) {
  console.log('[exit after snapshot] should exit after a heap snapshot, with continuous profiling on');
  await runTest(testConfig.getEnv);
}
