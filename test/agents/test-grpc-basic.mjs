// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import fixtures from '../common/fixtures.js';
import assert from 'node:assert';
import {
  checkExitData,
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

const SIGTERM = 15;

const tests = [];

tests.push({
  name: 'should work if agent is killed with signal',
  test: async (getEnv, isSecure) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer({ tls: isSecure });
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId, { code: SIGTERM, error: null, profile: '' });
          grpcServer.close();
          resolve();
        }));

        const env = getEnv(port, isSecure);

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        await child.kill();
      }));
    });
  },
});

tests.push({
  name: 'should work if agent exits gracefully without error',
  test: async (getEnv, isSecure) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer({ tls: isSecure });
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId, { code: 0, error: null, profile: '' });
          grpcServer.close();
          resolve();
        }));

        const env = getEnv(port, isSecure);

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        const exit = await child.shutdown(0);
        assert.ok(exit);
        assert.strictEqual(exit.code, 0);
        assert.strictEqual(exit.signal, null);
      }));
    });
  },
});

tests.push({
  name: 'should work if agent exits gracefully with error code',
  test: async (getEnv, isSecure) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer({ tls: isSecure });
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId, { code: 1, error: null, profile: '' });
          grpcServer.close();
          resolve();
        }));

        const env = getEnv(port, isSecure);

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        const exit = await child.shutdown(1);
        assert.ok(exit);
        assert.strictEqual(exit.code, 1);
        assert.strictEqual(exit.signal, null);
      }));
    });
  },
});

tests.push({
  name: 'should work if agent exits with exception',
  test: async (getEnv, isSecure) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer({ tls: isSecure });
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          const error = { message: 'Uncaught Error: error', stack: '' };
          checkExitData(data.msg, data.metadata, agentId, { code: 1, error, profile: '' });
          grpcServer.close();
          resolve();
        }));

        const env = getEnv(port, isSecure);

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        const exit = await child.exception('msg');
        assert.ok(exit);
        assert.strictEqual(exit.code, 1);
        assert.strictEqual(exit.signal, null);
      }));
    });
  },
});

tests.push({
  name: 'should reconnect after initial invalid NSOLID_GRPC',
  test: async (getEnv, isSecure) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer({ tls: isSecure });
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId, { code: 0, error: null, profile: '' });
          grpcServer.close();
          resolve();
        }));

        const correctEnv = getEnv(port, isSecure);
        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC: '127.0.0.1:1',
        };
        if (correctEnv.NSOLID_GRPC_INSECURE) {
          env.NSOLID_GRPC_INSECURE = correctEnv.NSOLID_GRPC_INSECURE;
        }
        if (correctEnv.NSOLID_GRPC_CERTS) {
          env.NSOLID_GRPC_CERTS = correctEnv.NSOLID_GRPC_CERTS;
        }

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();

        const config = {};
        if (correctEnv.NSOLID_GRPC) {
          config.grpc = correctEnv.NSOLID_GRPC;
        }
        if (correctEnv.NSOLID_SAAS) {
          config.saas = correctEnv.NSOLID_SAAS;
        }

        grpcServer.on('command', mustCall(async ({ agentId }) => {
          // Verify the CommandStream is working by sending a command from server to client
          const infoResult = await grpcServer.info(agentId);
          assert.ok(infoResult);
          const exit = await child.shutdown(0);
          assert.ok(exit);
          assert.strictEqual(exit.code, 0);
          assert.strictEqual(exit.signal, null);
        }));
        await child.config(config);
      }));
    });
  },
});

const testConfigs = [
  {
    getEnv: (port, isSecure) => {
      const env = {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_GRPC: `localhost:${port}`,
      };
      if (!isSecure) {
        env.NSOLID_GRPC_INSECURE = 1;
      } else {
        env.NSOLID_GRPC_CERTS = fixtures.path('keys', 'selfsigned-no-keycertsign', 'cert.pem');
      }
      return env;
    },
  },
  {
    getEnv: (port, isSecure) => {
      const env = {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_SAAS: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbtesting.localhost:${port}`,
      };
      if (!isSecure) {
        env.NSOLID_GRPC_INSECURE = 1;
      } else {
        env.NSOLID_GRPC_CERTS = fixtures.path('keys', 'selfsigned-no-keycertsign', 'cert.pem');
      }
      return env;
    },
  },
];

const isSecureOpts = [false, true];
for (const testConfig of testConfigs) {
  for (const { name, test } of tests) {
    for (const isSecure of isSecureOpts) {
      console.log(`[basic] ${name} ${isSecure ? 'secure' : 'insecure'}`);
      await test(testConfig.getEnv, isSecure);
    }
  }
}
