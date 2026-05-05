// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import {
  checkOTLPMetricsData,
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';


function checkMetricsData(msg, metadata, requestId, agentId, nsolidConfig, nsolidMetrics) {
  const metrics = msg;
  assert.strictEqual(metrics.common.requestId, requestId);
  assert.strictEqual(metrics.common.command, 'metrics');
  // From here check at least that all the fields are present
  assert.ok(metrics.common.recorded);
  assert.ok(metrics.common.recorded.seconds);
  assert.ok(metrics.common.recorded.nanoseconds);
  assert.ok(metrics.body);

  // also the body fields
  const resourceMetrics = metrics.body.resourceMetrics;
  checkOTLPMetricsData(resourceMetrics, agentId, nsolidConfig, nsolidMetrics, 1, false);
}

async function runTest({ getEnv }) {
  return new Promise((resolve) => {
    const grpcServer = new GRPCServer();
    grpcServer.start(mustSucceed(async (port) => {
      console.log('GRPC server started', port);
      const env = getEnv(port);
      const opts = {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env,
      };
      const child = new TestClient(['-t', 'http'], opts);
      const agentId = await child.id();
      const config = await child.config({ app: 'my_app_name' });
      for (let i = 0; i < 10; i++) {
        await child.trace('http');
      }

      grpcServer.once('metrics', mustCall(async () => {
        const metrics = await child.metrics();
        assert.strictEqual(config.app, 'my_app_name');
        const { data, requestId } = await grpcServer.metrics(agentId);
        checkMetricsData(data.msg, data.metadata, requestId, agentId, config, metrics);
        await child.shutdown(0);
        grpcServer.close();
        resolve();
      }));
    }));
  });
}

const testConfigs = [
  {
    getEnv: (port) => {
      return {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_GRPC: `localhost:${port}`,
      };
    },
  },
  {
    getEnv: (port) => {
      return {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_SAAS: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbtesting.localhost:${port}`,
      };
    },
  },
];

for (const testConfig of testConfigs) {
  await runTest(testConfig);
  console.log('run test!');
}
