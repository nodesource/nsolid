// Flags: --expose-internals
import { isWindows, mustCall, mustSucceed } from '../common/index.mjs';
import fixtures from '../common/fixtures.js';
import assert from 'node:assert';
import {
  checkExitData,
  checkRpcMetadata,
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

const SIGABRT = 6;
const SIGTERM = 15;

// An abort ends the process by SIGABRT, or on Windows with exit code 134.
const aborted = isWindows ? { code: 134 } : { code: SIGABRT, signal: 'SIGABRT' };

function checkAborted(exit) {
  assert.ok(exit);
  if (isWindows) {
    assert.strictEqual(exit.code, 134);
  } else {
    assert.strictEqual(exit.code, null);
    assert.strictEqual(exit.signal, 'SIGABRT');
  }
}

const tests = [];

tests.push({
  name: 'should work if agent is killed with signal',
  test: async (getEnv, isSecure) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer({ tls: isSecure });
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId,
                        { code: SIGTERM, signal: 'SIGTERM', error: null, profile: '' });
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
  name: 'should exit even if the exit event is never answered',
  test: async (getEnv, isSecure) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer({ tls: isSecure, hangExit: true });
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId, { code: 0, error: null, profile: '' });
        }));

        const env = getEnv(port, isSecure);

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        const start = Date.now();
        const exit = await child.shutdown(0);
        // The agent waits 5 seconds for the answer, then exits all the same.
        const waited = Date.now() - start;
        assert.ok(waited >= 4000 && waited < 15000, `exited after ${waited} ms`);
        assert.strictEqual(exit.code, 0);
        assert.strictEqual(exit.signal, null);
        grpcServer.close();
        resolve();
      }));
    });
  },
});

tests.push({
  name: 'should work if agent aborts',
  test: async (getEnv, isSecure) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer({ tls: isSecure });
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          // process.abort() aborts at its line in Node's source; the stack is
          // the JS that called it.
          const error = { message: /^Aborted at .+:\d+$/, stack: /client\.js/ };
          checkExitData(data.msg, data.metadata, agentId, { ...aborted, error, profile: '' });
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
        checkAborted(await child.abort());
      }));
    });
  },
});

tests.push({
  name: 'should work if agent runs out of memory',
  test: async (getEnv, isSecure) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer({ tls: isSecure });
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          // Out of memory, there's no reading the JS stack.
          const error = {
            message: /^FATAL ERROR: .*Allocation failed - JavaScript heap out of memory$/,
          };
          checkExitData(data.msg, data.metadata, agentId, { ...aborted, error, profile: '' });
          assert.strictEqual(data.msg.body.error.stack, '');
          grpcServer.close();
          resolve();
        }));

        const env = {
          ...getEnv(port, isSecure),
          NODE_OPTIONS: '--max-old-space-size=32',
        };

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        checkAborted(await child.oom());
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

        grpcServer.on('command', mustCall(async ({ agentId, metadata }) => {
          // Verify the CommandStream is working by sending a command from server to client
          checkRpcMetadata(metadata, agentId);
          if (correctEnv.NSOLID_SAAS) {
            assert.strictEqual(metadata['nsolid-saas'][0], correctEnv.NSOLID_SAAS);
          }
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
