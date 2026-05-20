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
  validateString(profile.common.requestId, 'requestId');
  assert.ok(profile.common.requestId.length > 0);
  if (requestId) {
    assert.strictEqual(profile.common.requestId, requestId);
  }

  assert.strictEqual(profile.common.command, 'heap_sampling');
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

  validateString(profile.duration, 'profile.duration');
  const duration = BigInt(profile.duration);
  assert.ok(duration > 0);

  validateString(profile.data, 'profile.data');
  const heapSampling = JSON.parse(profile.data);
  validateObject(heapSampling, 'heapSampling');

  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

function checkProfileError(profile, metadata, requestId, agentId, code, msg) {
  assert.strictEqual(profile.common.requestId, requestId);
  assert.strictEqual(profile.common.command, 'heap_sampling');
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
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port);
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
                kind: 'stringValue',
              },
            },
          },
          heapSampling: {
            sampleInterval: 50,
          },
        };

        const { data, requestId } = await grpcServer.heapSampling(agentId, options);
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
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port);
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
                kind: 'stringValue',
              },
            },
          },
          heapSampling: {
            sampleInterval: 50,
          },
        };

        const { data, requestId } = await grpcServer.heapSampling(agentId, options);
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
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port);
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

        const { data, requestId } = await grpcServer.heapSampling(agentId, options);
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
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port);
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

        grpcServer.heapSampling(agentId, options).then(async ({ data, requestId }) => {
          checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
          await child.shutdown(0);
          grpcServer.close();
          resolve();
        }).then(mustCall());

        const { data, requestId } = await grpcServer.heapSampling(agentId, options);
        checkProfileError(data.msg, data.metadata, requestId, agentId, 409, 'Operation already in progress(1001)');
      }));
    });
  },
});

tests.push({
  name: 'should return 409 if profile in progress in worker',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port);
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

        grpcServer.heapSampling(agentId, options).then(async ({ data, requestId }) => {
          checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
          await child.shutdown(0);
          grpcServer.close();
          resolve();
        }).then(mustCall());

        const { data, requestId } = await grpcServer.heapSampling(agentId, options);
        checkProfileError(data.msg, data.metadata, requestId, agentId, 409, 'Operation already in progress(1001)');
      }));
    });
  },
});

tests.push({
  name: 'should return 500 if assets collection is disabled',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = {
          ...getEnv(port),
          NSOLID_ASSETS_ENABLED: '0',
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
          heapSampling: {
            sampleInterval: 50,
          },
        };

        const { data, requestId } = await grpcServer.heapSampling(agentId, options);
        checkProfileError(data.msg,
                          data.metadata,
                          requestId,
                          agentId,
                          500,
                          'Assets collection disabled(1008)');
        await child.shutdown(0);
        grpcServer.close();
        resolve();
      }));
    });
  },
});

tests.push({
  name: 'should respect assetsEnabled toggled via nsolid.start()',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port);
        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        const profileOpts = {
          duration: 100,
          threadId: 0,
          heapSampling: {
            sampleInterval: 50,
          },
        };

        const disabledConfig = await child.config({ assetsEnabled: false });
        assert.strictEqual(disabledConfig.assetsEnabled, false);

        const disabledResult = await grpcServer.heapSampling(agentId, profileOpts);
        checkProfileError(disabledResult.data.msg,
                          disabledResult.data.metadata,
                          disabledResult.requestId,
                          agentId,
                          500,
                          'Assets collection disabled(1008)');

        const enabledConfig = await child.config({ assetsEnabled: true });
        assert.strictEqual(enabledConfig.assetsEnabled, true);

        const { data, requestId } = await grpcServer.heapSampling(agentId, profileOpts);
        checkProfileData(data.msg, data.metadata, requestId, agentId, profileOpts, true);

        await child.shutdown(0);
        grpcServer.close();
        resolve();
      }));
    });
  },
});

tests.push({
  name: 'should respect enableAssets()/disableAssets() helpers',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port);
        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        const profileOpts = {
          duration: 100,
          threadId: 0,
          heapSampling: {
            sampleInterval: 50,
          },
        };

        await child.disableAssets();

        const disabledResult = await grpcServer.heapSampling(agentId, profileOpts);
        checkProfileError(disabledResult.data.msg,
                          disabledResult.data.metadata,
                          disabledResult.requestId,
                          agentId,
                          500,
                          'Assets collection disabled(1008)');

        await child.enableAssets();

        const { data, requestId } = await grpcServer.heapSampling(agentId, profileOpts);
        checkProfileData(data.msg, data.metadata, requestId, agentId, profileOpts, true);

        const currentConfig = await child.config();
        assert.strictEqual(currentConfig.assetsEnabled, true);

        await child.shutdown(0);
        grpcServer.close();
        resolve();
      }));
    });
  },
});

tests.push({
  name: 'should end an ongoing profile before exiting',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId, { code: 0, error: null, profile: '' });
          grpcServer.close();
          resolve();
        }));

        const env = getEnv(port);
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

        grpcServer.heapSampling(agentId, options).then(async ({ data, requestId }) => {
          checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
        }).then(mustCall());

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
  name: 'should also work from the JS api',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port);
        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const duration = 100;
        grpcServer.once('heap_sampling', mustCall(async (data) => {
          checkProfileData(data.msg, data.metadata, null, agentId, { duration, threadId: 0 }, true);
          await child.shutdown(0);
          grpcServer.close();
          resolve();
        }));

        const agentId = await child.id();
        await child.heapSampling(duration);
      }));
    });
  },
});

const testConfigs = [
  {
    getEnv: (port) => {
      return {
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_GRPC: `localhost:${port}`,
      };
    },
  },
  {
    getEnv: (port) => {
      return {
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_SAAS: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbtesting.localhost:${port}`,
      };
    },
  },
];

for (const testConfig of testConfigs) {
  for (const { name, test } of tests) {
    console.log(`[heap sampling] ${name}`);
    await test(testConfig.getEnv);
  }
}
