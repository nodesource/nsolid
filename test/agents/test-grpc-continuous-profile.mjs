// Flags: --expose-internals
import { mustCall, mustNotCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { setTimeout } from 'node:timers/promises';
import validators from 'internal/validators';
import {
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

const {
  validateArray,
  validateNumber,
  validateObject,
  validateString,
} = validators;

function checkContinuousProfileData(profile, metadata, agentId, options, interval = 100) {
  validateString(profile.common.requestId, 'requestId');
  assert.ok(profile.common.requestId.length > 0);

  assert.strictEqual(profile.common.command, 'profile');
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

  validateNumber(profile.startTs, 'profile.startTs');
  validateNumber(profile.endTs, 'profile.endTs');
  // Make sure the start and end timestamps are correctly calculated
  const diff = profile.endTs - profile.startTs;
  assert.ok(diff > 0);
  assert.ok(diff < 5 * interval);
  const now = Date.now();
  assert.ok(now - profile.startTs > 0);
  assert.ok(now - profile.startTs < 5000);
  assert.ok(now - profile.endTs > 0);
  assert.ok(now - profile.endTs < 5000);

  validateString(profile.data, 'profile.data');
  const profileData = JSON.parse(profile.data);
  validateObject(profileData, 'profileData');

  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

function checkProfileError(profile, metadata, requestId, agentId, code, msg) {
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
  name: 'should start continuous CPU profiling when enabled',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        let times = 0;
        grpcServer.on('profile', mustCall(async (data) => {
          checkContinuousProfileData(data.msg, data.metadata, agentId, options);
          times++;
          if (times === 2) {
            const diff = process.hrtime(startTime);
            assert.strictEqual(diff[0], 0);
            assert.ok(diff[1] > 200000000);
            await child.shutdown(0);
            grpcServer.close();
            resolve();
          }
        }, 2));
        const env = getEnv(port);

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };

        let startTime = process.hrtime();
        const child = new TestClient([], opts);
        const agentId = await child.id();
        const options = {
          threadId: 0,
        };
      }));
    });
  },
});

tests.push({
  name: 'should not emit continuous profiles when assets are disabled via env',
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
        await child.id();

        grpcServer.on(
          'profile',
          mustNotCall('continuous profiles should not be emitted when assets are disabled'),
        );

        // Wait slightly longer than two intervals (100ms) to see if any profile arrives.
        await setTimeout(300);
        await child.shutdown(0);
        grpcServer.close();
        resolve();
      }));
    });
  },
});

tests.push({
  name: 'should stop continuous profiling after disabling assets via start config',
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
        await child.id();
        await child.config({
          contCpuProfile: true,
          contCpuProfileInterval: 100,
        });

        let profileCount = 0;
        grpcServer.on('profile', () => {
          profileCount++;
        });

        await setTimeout(500);
        assert.ok(profileCount >= 1);

        await child.config({ assetsEnabled: false });
        const countAfterDisable = profileCount;

        await setTimeout(500);
        assert.ok(profileCount - countAfterDisable <= 1);

        await child.config({ assetsEnabled: true });
        await setTimeout(500);
        assert.ok(profileCount > countAfterDisable);

        await child.shutdown(0);
        grpcServer.close();
        resolve();
      }));
    });
  },
});

tests.push({
  name: 'should stop continuous profiling after disableAssets()/enableAssets()',
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
        await child.id();

        let profileCount = 0;
        grpcServer.on('profile', () => {
          profileCount++;
        });

        await setTimeout(500);
        assert.ok(profileCount >= 1);

        await child.disableAssets();
        const countAfterDisable = profileCount;

        await setTimeout(500);
        assert.ok(profileCount - countAfterDisable <= 1);

        await child.enableAssets();
        await setTimeout(500);
        assert.ok(profileCount > countAfterDisable);

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
  name: 'should also work with worker threads',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        let timesMainThread = 0;
        let timesWorker = 0;
        const env = getEnv(port);

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };

        const startTime = process.hrtime();
        const child = new TestClient([ '-w', 1 ], opts);
        const agentId = await child.id();
        const workers = await child.workers();
        const wid = workers[0];

        grpcServer.on('profile', mustCall(async (data) => {
          if (data.msg.threadId === '0') {
            timesMainThread++;
          } else {
            assert.strictEqual(data.msg.threadId, `${wid}`);
            timesWorker++;
          }

          const options = {
            threadId: data.msg.threadId,
          };

          checkContinuousProfileData(data.msg, data.metadata, agentId, options);
          if (timesMainThread === 2 && timesWorker === 2) {
            const diff = process.hrtime(startTime);
            assert.strictEqual(diff[0], 0);
            assert.ok(diff[1] > 200000000);
            await child.shutdown(0);
            grpcServer.close();
            resolve();
          }
        }, 4));
      }));
    });
  },
});

tests.push({
  name: 'should start continuous CPU profiling after enabling',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        let times = 0;
        grpcServer.on('profile', mustCall(async (data) => {
          checkContinuousProfileData(data.msg, data.metadata, agentId, options);
          times++;
          if (times === 2) {
            const diff = process.hrtime(startTime);
            assert.strictEqual(diff[0], 0);
            assert.ok(diff[1] > 200000000);
            await child.shutdown(0);
            grpcServer.close();
            resolve();
          }
        }, 2));
        const env = getEnv(port);

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };

        let startTime = process.hrtime();
        const child = new TestClient([], opts);
        const agentId = await child.id();
        await child.config({
          contCpuProfile: true,
          contCpuProfileInterval: 100, // 100ms for faster testing
        });
        const options = {
          threadId: 0,
        };
      }));
    });
  },
});

tests.push({
  name: 'should enable continuous profiling during an active CPU profile',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        let continuousProfilesReceived = 0;

        // Start TestClient without continuous profiling
        const env = getEnv(port);
        delete env.NSOLID_CONT_CPU_PROFILE;
        delete env.NSOLID_CONT_CPU_PROFILE;

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };

        const child = new TestClient([], opts);
        const agentId = await child.id();

        // Start a CPU profile with a longer duration to give us time to enable continuous profiling
        const options = {
          duration: 1000,
          threadId: 0,
        };

        const { data, requestId } = await grpcServer.cpuProfile(agentId, options);
        assert.ok(data);
        assert.ok(requestId);

        grpcServer.on('profile', async (data) => {
          // This is a continuous profile
          continuousProfilesReceived++;
          console.log(`Received continuous profile #${continuousProfilesReceived}`);
          checkContinuousProfileData(data.msg, data.metadata, agentId, options);
          if (continuousProfilesReceived >= 2) {
            // We've received both the requested profile and at least 2 continuous profiles
            await child.shutdown(0);
            grpcServer.close();
            resolve();
          }
        });

        // Wait a short time to ensure the profile has started
        await setTimeout(200);
        // Enable continuous profiling by updating the configuration
        await child.config({
          contCpuProfile: true,
          contCpuProfileInterval: 100, // 100ms for faster testing
        });
      }));
    });
  },
});

tests.push({
  name: 'should not allow manual CPU profiling when continuous CPU profiling is enabled',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        // Set up continuous profile handler
        let continuousProfilesReceived = 0;
        grpcServer.on('profile', async (data) => {
          if (data.continuous) {
            continuousProfilesReceived++;
            const options = {
              threadId: 0,
            };

            checkContinuousProfileData(data.msg, data.metadata, agentId, options);
            if (continuousProfilesReceived >= 2 && profileErrorTested) {
              await child.shutdown(0);
              grpcServer.close();
              resolve();
            }
          }
        });

        // Start TestClient with continuous profiling enabled
        const env = getEnv(port);

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };

        const child = new TestClient([], opts);
        const agentId = await child.id();
        let profileErrorTested = false;

        // Wait for continuous profiling to start
        await setTimeout(400);
        // Try to perform a manual CPU profile - this should fail with EInProgressError
        const options = {
          duration: 100,
          threadId: 0,
        };
        const { data, requestId } = await grpcServer.cpuProfile(agentId, options);
        // Verify the error response
        checkProfileError(
          data.msg,
          data.metadata,
          requestId,
          agentId,
          409, // 409 Conflict - Operation already in progress
          'Operation already in progress(1001)',
        );

        profileErrorTested = true;
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
        NSOLID_CONT_CPU_PROFILE: 'true',
        NSOLID_CONT_CPU_PROFILE_INTERVAL: '100', // 100ms for faster testing
      };
    },
  },
  {
    getEnv: (port) => {
      return {
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_SAAS: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbtesting.localhost:${port}`,
        NSOLID_CONT_CPU_PROFILE: 'true',
        NSOLID_CONT_CPU_PROFILE_INTERVAL: '100', // 100ms for faster testing
      };
    },
  },
];

for (const testConfig of testConfigs) {
  for (const { name, test } of tests) {
    console.log(`[continuous profile] ${name}`);
    await test(testConfig.getEnv);
  }
}
