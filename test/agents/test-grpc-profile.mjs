// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { setTimeout } from 'node:timers/promises';
import validators from 'internal/validators';
import {
  checkExitData,
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

const {
  validateArray,
  validateObject,
  validateString,
} = validators;

function checkProfileData(profile, metadata, requestId, agentId, options) {
  console.dir(profile, { depth: null });
  assert.strictEqual(profile.common.requestId, requestId);
  assert.strictEqual(profile.common.command, 'profile');
  // From here check at least that all the fields are present
  validateObject(profile.common.recorded, 'recorded');
  const recSeconds = BigInt(profile.common.recorded.seconds);
  assert.ok(recSeconds);
  const recNanoSecs = BigInt(profile.common.recorded.nanoseconds);
  assert.ok(recNanoSecs);

  assert.strictEqual(profile.threadId, `${options.threadId}`);
  if (options.metadata) {
    assert.deepStrictEqual(profile.metadata, options.metadata);
  }
  validateString(profile.data, 'profile.data');
  const heapSampling = JSON.parse(profile.data);
  validateObject(heapSampling, 'heapSampling');

  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

function checkProfileError(profile, metadata, requestId, agentId, code, msg) {
  console.dir(profile, { depth: null });
  assert.strictEqual(profile.common.requestId, requestId);
  assert.strictEqual(profile.common.command, 'profile');
  // From here check at least that all the fields are present
  validateObject(profile.common.recorded, 'recorded');
  const recSeconds = BigInt(profile.common.recorded.seconds);
  assert.ok(recSeconds);
  const recNanoSecs = BigInt(profile.common.recorded.nanoseconds);
  assert.ok(recNanoSecs);

  validateObject(profile.common.error, 'error');
  assert.strictEqual(profile.common.error.code, code);
  assert.strictEqual(profile.common.error.message, msg);

  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

const tests = [];

tests.push({
  name: 'should work for the main thread',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
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
        const options = {
          duration: 100,
          threadId: 0,
          metadata: {
            fields: {
              a: {
                stringValue: 'x',
                kind: 'stringValue'
              }
            }
          },
        };

        const { data, requestId } = await grpcServer.cpuProfile(agentId, options);
        checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
        await child.shutdown(0);
        grpcServer.close();
        resolve();
      }));
    });
  },
});

tests.push({
  name: 'should work for worker threads',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`
        };

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([ '-w', 1 ], opts);
        const agentId = await child.id();
        const workers = await child.workers();
        const wid = workers[0];
        const options = {
          duration: 100,
          threadId: wid,
          metadata: {
            fields: {
              a: {
                stringValue: 'x',
                kind: 'stringValue'
              }
            }
          },
        };

        const { data, requestId } = await grpcServer.cpuProfile(agentId, options);
        checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
        await child.shutdown(0);
        grpcServer.close();
        resolve();
      }));
    });
  },
});

tests.push({
  name: 'should return 410 if sent to a non-existant thread',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
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
        const options = {
          duration: 100,
          threadId: 10,
        };

        const { data, requestId } = await grpcServer.cpuProfile(agentId, options);
        checkProfileError(data.msg, data.metadata, requestId, agentId, 410, 'Thread already gone(1002)');
        await child.shutdown(0);
        grpcServer.close();
        resolve();
      }));
    });
  },
});

tests.push({
  name: 'should return 409 if profile in progress in main thread',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
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
        const options = {
          duration: 100,
          threadId: 0,
        };

        grpcServer.cpuProfile(agentId, options).then(async ({ data, requestId }) => {
          checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
          await child.shutdown(0);
          grpcServer.close();
          resolve();
        });
          
        const { data, requestId } = await grpcServer.cpuProfile(agentId, options);
        checkProfileError(data.msg, data.metadata, requestId, agentId, 409, 'Operation already in progress(1001)');
      }));
    });
  },
});

tests.push({
  name: 'should return 409 if profile in progress in worker',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`
        };

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };

        const child = new TestClient([ '-w', 1 ], opts);
        const agentId = await child.id();
        const workers = await child.workers();
        const wid = workers[0];
        const options = {
          duration: 100,
          threadId: wid,
        };

        grpcServer.cpuProfile(agentId, options).then(async ({ data, requestId }) => {
          checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
          await child.shutdown(0);
          grpcServer.close();
          resolve();
        });
          
        const { data, requestId } = await grpcServer.cpuProfile(agentId, options);
        checkProfileError(data.msg, data.metadata, requestId, agentId, 409, 'Operation already in progress(1001)');
      }));
    });
  },
});

tests.push({
  name: 'should end an ongoing profile before exiting',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        let reqId;
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId, { code: 0, error: null, profile: reqId });
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
        const options = {
          duration: 5000,
          threadId: 0,
        };

        grpcServer.cpuProfile(agentId, options).then(async ({ data, requestId }) => {
          reqId = requestId;
          checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
        });
          
        await setTimeout(100);
        const exit = await child.shutdown(0);
        assert.ok(exit);
        assert.strictEqual(exit.code, 0);
        assert.strictEqual(exit.signal, null);
      }));
    });
  },
});

tests.push({
  name: 'should end an ongoing cpu profile and heap profile before exiting',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        let reqId;
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId, { code: 0, error: null, profile: reqId });
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
        const options = {
          duration: 50000,
          threadId: 0,
        };

        grpcServer.cpuProfile(agentId, options).then(mustCall(async ({ data, requestId }) => {
          console.log('cpuProfile', requestId);
          reqId = requestId;
          checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
        }));

        grpcServer.heapProfile(agentId, options).then(mustCall(async ({ data, requestId }) => {
          // checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
        }));

        grpcServer.heapSampling(agentId, options).then(mustCall(async ({ data, requestId }) => {
          // checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
        }));
          
        await setTimeout(100);
        console.log('shutting down');
        const exit = await child.shutdown(0);
        assert.ok(exit);
        assert.strictEqual(exit.code, 0);
        assert.strictEqual(exit.signal, null);
      }));
    });
  },
});

for (const { name, test } of tests) {
  console.log(`[cpu profile] ${name}`);
  await test();
}
