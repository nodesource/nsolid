// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import validators from 'internal/validators';
import {
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

const {
  validateArray,
  validateObject,
  validateString,
} = validators;

const SIGTERM = 15;

const tests = [];

function checkExitData(data, metadata, agentId, expectedData) {
  assert.strictEqual(data.common.requestId, '');
  assert.strictEqual(data.common.command, 'exit');
  // From here check at least that all the fields are present
  validateObject(data.common.recorded, 'recorded');
  const recSeconds = BigInt(data.common.recorded.seconds);
  assert.ok(recSeconds);
  const recNanoSecs = BigInt(data.common.recorded.nanoseconds);
  assert.ok(recNanoSecs);
  validateObject(data.body, 'body');
  // also the body fields
  assert.strictEqual(data.body.code, expectedData.code);
  if (expectedData.error === null) {
    assert.strictEqual(data.body.error, null);
  } else {
    assert.ok(data.body.error);
    assert.strictEqual(data.body.error.message, expectedData.error.message);
    validateString(data.body.error.stack, 'error.stack');
  }

  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

tests.push({
  name: 'should work if agent is killed with signal',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId, { code: SIGTERM, error: null, profile: '' });
          grpcServer.close();
          resolve();
        }));

        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`
        };

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
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId, { code: 0, error: null, profile: '' });
          grpcServer.close();
          resolve();
        }));

        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`
        };

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
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId, { code: 1, error: null, profile: '' });
          grpcServer.close();
          resolve();
        }));

        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`
        };

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
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId, { code: 1, error: { message: 'Uncaught Error: error', stack: ''}, profile: '' });
          grpcServer.close();
          resolve();
        }));

        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`
        };

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

for (const { name, test } of tests) {
  console.log(`[basic] ${name}`);
  await test();
}
