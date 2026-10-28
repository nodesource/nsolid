// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import fixtures from '../common/fixtures.js';
import assert from 'node:assert';
import {
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

function checkInfoData(msg, metadata, requestId, agentId, nsolidConfig = {}) {
  const info = msg;
  assert.strictEqual(info.common.requestId, requestId);
  assert.strictEqual(info.common.command, 'info');
  assert.strictEqual(info.common.error, null);
  assert.strictEqual(info.body.id, agentId);
  assert.ok(info.common.recorded);
  assert.ok(info.common.recorded.seconds);
  assert.ok(info.common.recorded.nanoseconds);
  // also the body fields
  assert.ok(info.body.app);
  assert.strictEqual(info.body.app, nsolidConfig.appName || 'untitled application');
  assert.strictEqual(info.body.appVersion, nsolidConfig.appVersion);
  assert.ok(info.body.arch);
  assert.ok(info.body.cpuCores);
  assert.ok(info.body.cpuModel);
  assert.ok(info.body.execPath);
  assert.ok(info.body.hostname);
  assert.ok(info.body.id);
  assert.ok(info.body.main);
  assert.strictEqual(info.body.nodeEnv, nsolidConfig.nodeEnv || 'prod');
  assert.ok(info.body.pid);
  assert.ok(info.body.platform);
  assert.ok(info.body.processStart);
  assert.strictEqual(info.body.tags.length, nsolidConfig.tags ? nsolidConfig.tags.length : 0);
  assert.ok(info.body.totalMem);
  assert.deepStrictEqual(info.body.versions, process.versions);
  assert.strictEqual(typeof info.body.kernelVersion, 'number');
  assert.ok(metadata['user-agent']);
  assert.ok(metadata['nsolid-agent-id']);
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

const tests = [];

tests.push({
  name: 'should retrieve info with default config',
  test: async (getEnv, isSecure) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer({ tls: isSecure });
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port, isSecure);
        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };

        const nsolidConfig = {
          appName: 'nsolid-grpc-agent',
          appVersion: '1.0.0',
          tags: [],
          nodeEnv: 'prod',
        };

        grpcServer.on('command', mustCall(async ({ agentId }) => {
          const { data, requestId } = await grpcServer.info(agentId);
          checkInfoData(data.msg, data.metadata, requestId, agentId, nsolidConfig);
          console.dir(data, { depth: null });
          await child.shutdown(0);
          grpcServer.close();
          resolve();
        }));

        const child = new TestClient([], opts);
      }));
    });
  },
});

tests.push({
  name: 'should retrieve info with custom config',
  test: async (getEnv, isSecure) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer({ tls: isSecure });
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port, isSecure, {
          NSOLID_APPNAME: 'myapp',
          NSOLID_TAGS: 'tag1,tag2',
          NODE_ENV: 'dev',
        });

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };

        const nsolidConfig = {
          appName: 'myapp',
          appVersion: '1.0.0',
          tags: ['tag1', 'tag2'],
          nodeEnv: 'dev',
        };

        grpcServer.on('command', mustCall(async ({ agentId }) => {
          const { data, requestId } = await grpcServer.info(agentId);
          checkInfoData(data.msg, data.metadata, requestId, agentId, nsolidConfig);
          console.dir(data, { depth: null });
          await child.shutdown(0);
          grpcServer.close();
          resolve();
        }));

        const child = new TestClient([], opts);
      }));
    });
  },
});

const testConfigs = [
  {
    getEnv: (port, isSecure, extraEnv = {}) => {
      const env = {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_GRPC: `localhost:${port}`,
        ...extraEnv,
      };
      if (!isSecure) {
        env.NSOLID_GRPC_INSECURE = 1;
      } else {
        env.NSOLID_GRPC_CERTS = fixtures.path('keys', 'selfsigned-no-keycertsign', 'cert.pem');
      }
      return env;
    },
    nsolidConfig: {
      appName: 'nsolid-grpc-agent',
      appVersion: '1.0.0',
      tags: [],
      nodeEnv: 'prod',
    },
  },
  {
    getEnv: (port, isSecure, extraEnv = {}) => {
      const env = {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_SAAS: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbtesting.localhost:${port}`,
        ...extraEnv,
      };
      if (!isSecure) {
        env.NSOLID_GRPC_INSECURE = 1;
      } else {
        env.NSOLID_GRPC_CERTS = fixtures.path('keys', 'selfsigned-no-keycertsign', 'cert.pem');
      }
      return env;
    },
    nsolidConfig: {},
  },
];

const isSecureOpts = [false, true];
for (const testConfig of testConfigs) {
  for (const { name, test } of tests) {
    for (const isSecure of isSecureOpts) {
      console.log(`[info] ${name} ${isSecure ? 'secure' : 'insecure'}`);
      await test(testConfig.getEnv, isSecure);
    }
  }
}
