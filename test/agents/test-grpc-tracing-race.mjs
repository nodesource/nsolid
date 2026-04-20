// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import {
  checkExitData,
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

const traceBursts = 100;
const toggleRounds = 20;

async function runRepro(getEnv, kind) {
  return new Promise((resolve, reject) => {
    const grpcServer = new GRPCServer();
    grpcServer.start(mustSucceed(async (port) => {
      const env = getEnv(port);
      const opts = {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env,
      };

      const client = new TestClient([], opts);
      const agentId = await client.id();

      grpcServer.on('exit', mustCall((data) => {
        checkExitData(data.msg, data.metadata, agentId, { code: 0, error: null, profile: '' });
        grpcServer.close();
        resolve();
      }));

      // Send lots of trace requests to trigger tracing
      for (let i = 0; i < traceBursts; i++) {
        client.tracing(kind, 0);
      }

      // Toggle tracing on and off
      for (let i = 0; i < toggleRounds; i++) {
        const enabled = (i % 2) !== 0;
        await grpcServer.reconfigure(agentId, { tracingEnabled: enabled });
      }

      await client.shutdown();
    }));
  });
}

const tests = [];
tests.push({
  name: 'should reproduce fetch tracing crash via grpc reconfigure',
  test: async (getEnv) => runRepro(getEnv, 'fetch'),
});

tests.push({
  name: 'should reproduce http tracing crash via grpc reconfigure',
  test: async (getEnv) => runRepro(getEnv, 'http'),
});

const testConfigs = [
  {
    getEnv: (port) => ({
      NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
      NSOLID_GRPC_INSECURE: 1,
      NSOLID_GRPC: `localhost:${port}`,
      NSOLID_TRACING_ENABLED: 1,
      NSOLID_INTERVAL: 100000,
    }),
  },
];

for (const testConfig of testConfigs) {
  for (const { name, test } of tests) {
    console.log(`[tracing] ${name}`);
    await test(testConfig.getEnv);
  }
}
