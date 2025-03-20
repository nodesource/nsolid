// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
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

function checkContinuousProfileData(profile, metadata, agentId, options) {
  console.dir(profile, { depth: null });
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

  validateString(profile.data, 'profile.data');
  const profileData = JSON.parse(profile.data);
  validateObject(profileData, 'profileData');

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
  name: 'should start continuous CPU profiling when enabled',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        let times = 0;
        grpcServer.on('profile', async (data) => {
          checkContinuousProfileData(data.msg, data.metadata, agentId, options);
          times++;
          if (times === 2) {
            const diff = process.hrtime(startTime);
            console.log('diff', diff);
            assert.strictEqual(diff[0], 0);
            assert.ok(diff[1] > 200000000);
            await child.shutdown(0);
            grpcServer.close();
            resolve();
          }
        });
        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`,
          NSOLID_CONT_CPU_PROFILE: 'true',
          NSOLID_CONT_CPU_PROFILE_INTERVAL: '100', // 100ms for faster testing
        };

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
  name: 'should also work with worker threads',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        let timesMainThread = 0;
        let timesWorker = 0;
        grpcServer.on('profile', async (data) => {
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
            console.log('diff', diff);
            assert.strictEqual(diff[0], 0);
            assert.ok(diff[1] > 200000000);
            await child.shutdown(0);
            grpcServer.close();
            resolve();
          }
        });
        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`,
          NSOLID_CONT_CPU_PROFILE: 'true',
          NSOLID_CONT_CPU_PROFILE_INTERVAL: '100', // 100ms for faster testing
        };

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };

        let startTime = process.hrtime();
        const child = new TestClient([ '-w', 1 ], opts);
        const agentId = await child.id();
        const workers = await child.workers();
        const wid = workers[0];
      }));
    });
  },
});

tests.push({
  name: 'should start continuous CPU profiling after enabling',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        let times = 0;
        grpcServer.on('profile', async (data) => {
          checkContinuousProfileData(data.msg, data.metadata, agentId, options);
          times++;
          if (times === 2) {
            const diff = process.hrtime(startTime);
            console.log('diff', diff);
            assert.strictEqual(diff[0], 0);
            assert.ok(diff[1] > 200000000);
            await child.shutdown(0);
            grpcServer.close();
            resolve();
          }
        });
        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`,
        };

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
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        let continuousProfilesReceived = 0;

        // Start TestClient without continuous profiling
        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`,
        };

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };

        const child = new TestClient([], opts);
        const agentId = await child.id();

        // Start a CPU profile with a longer duration to give us time to enable continuous profiling
        console.log('Starting CPU profile');
        const options = {
          duration: 1000,
          threadId: 0,
        };

        await grpcServer.cpuProfile(agentId, options);

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
        setTimeout(async () => {
          console.log('Enabling continuous profiling during CPU profile');
          // Enable continuous profiling by updating the configuration
          await child.config({
            contCpuProfile: true,
            contCpuProfileInterval: 100, // 100ms for faster testing
          });
        }, 200);
      }));
    });
  },
});

tests.push({
  name: 'should not allow manual CPU profiling when continuous CPU profiling is enabled',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        // Set up continuous profile handler
        let continuousProfilesReceived = 0;
        grpcServer.on('profile', async (data) => {
          if (data.continuous) {
            continuousProfilesReceived++;
            console.log(`Received continuous profile #${continuousProfilesReceived}`);
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
        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`,
          NSOLID_CONT_CPU_PROFILE: 'true',
          NSOLID_CONT_CPU_PROFILE_INTERVAL: '100', // 100ms for faster testing
        };

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };

        const child = new TestClient([], opts);
        const agentId = await child.id();
        let profileErrorTested = false;

        // Wait for continuous profiling to start
        setTimeout(async () => {
          console.log('Attempting manual CPU profile while continuous profiling is active');
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

          console.log('Received expected error for manual CPU profile');
          profileErrorTested = true;
        }, 400);
      }));
    });
  },
});

for (const { name, test } of tests) {
  console.log(`[continuous profile] ${name}`);
  await test();
}
