// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { setTimeout } from 'node:timers/promises';
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

/**
 * data has this format:
 * {
    agentId: '1a3ff062d4c016000bd4a8bd33f22c002d6ed6b3',
    requestId: '5625b2d3-55b7-4660-84d1-5ad6f003f933',
    command: 'heap_profile',
    duration: 112,
    metadata: { reason: 'unspecified' },
    complete: false,
    threadId: 0,
    version: 4,
    bulkId: '5625b2d3-55b7-4660-84d1-5ad6f003f933'
  }
 */
function checkProfileData(profile, metadata, requestId, agentId, options, onExit = false) {
  console.dir(profile, { depth: null });
  assert.strictEqual(profile.common.requestId, requestId);
  assert.strictEqual(profile.common.command, 'heap_profile');
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
  const heapProf = JSON.parse(profile.data);
  validateObject(heapProf, 'heapProf');
  if (options?.heapProfile?.trackAllocations === true) {
    assert.ok(heapProf.snapshot.trace_function_count > 0);
    assert.ok(heapProf.trace_function_infos.length > 0);
    assert.ok(heapProf.trace_tree.length > 0);
  } else {
    assert.strictEqual(heapProf.snapshot.trace_function_count, 0);
    assert.strictEqual(heapProf.trace_function_infos.length, 0);
    assert.strictEqual(heapProf.trace_tree.length, 0);
  }

  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

function checkProfileError(profile, metadata, requestId, agentId, code, msg) {
  console.dir(profile, { depth: null });
  assert.strictEqual(profile.common.requestId, requestId);
  assert.strictEqual(profile.common.command, 'heap_profile');
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
// const trackAllocations = [false, true];
// for (const track of trackAllocations) {
//   tests.push({
//     name: `should work for the main thread with trackAllocations=${track}`,
//     test: async () => {
//       return new Promise((resolve) => {
//         const grpcServer = new GRPCServer();
//         grpcServer.start(mustSucceed(async (port) => {
//           const env = {
//             NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
//             NSOLID_GRPC_INSECURE: 1,
//             NSOLID_GRPC: `localhost:${port}`
//           };
  
//           const opts = {
//             stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
//             env,
//           };
//           const child = new TestClient([], opts);
//           const agentId = await child.id();
//           const options = {
//             duration: 100,
//             threadId: 0,
//             metadata: {
//               fields: {
//                 a: {
//                   stringValue: 'x',
//                   kind: 'stringValue'
//                 }
//               }
//             },
//             heapProfile: {
//               trackAllocations: track
//             }
//           };

//           const { data, requestId } = await grpcServer.heapProfile(agentId, options);
//           checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
//           await child.shutdown(0);
//           grpcServer.close();
//           resolve();
//         }));
//       });
//     },
//   });

//   tests.push({
//     name: `should work for worker threads with trackAllocations=${track}`,
//     test: async () => {
//       return new Promise((resolve) => {
//         const grpcServer = new GRPCServer();
//         grpcServer.start(mustSucceed(async (port) => {
//           const env = {
//             NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
//             NSOLID_GRPC_INSECURE: 1,
//             NSOLID_GRPC: `localhost:${port}`
//           };
  
//           const opts = {
//             stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
//             env,
//           };
//           const child = new TestClient([ '-w', 1 ], opts);
//           const agentId = await child.id();
//           const workers = await child.workers();
//           const wid = workers[0];
//           const options = {
//             duration: 100,
//             threadId: wid,
//             metadata: {
//               fields: {
//                 a: {
//                   stringValue: 'x',
//                   kind: 'stringValue'
//                 }
//               }
//             },
//             heapProfile: {
//               trackAllocations: track
//             }
//           };

//           const { data, requestId } = await grpcServer.heapProfile(agentId, options);
//           checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
//           await child.shutdown(0);
//           grpcServer.close();
//           resolve();
//         }));
//       });
//     },
//   });
// }

// tests.push({
//   name: 'should return 410 if sent to a non-existant thread',
//   test: async () => {
//     return new Promise((resolve) => {
//       const grpcServer = new GRPCServer();
//       grpcServer.start(mustSucceed(async (port) => {
//         const env = {
//           NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
//           NSOLID_GRPC_INSECURE: 1,
//           NSOLID_GRPC: `localhost:${port}`
//         };

//         const opts = {
//           stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
//           env,
//         };
//         const child = new TestClient([], opts);
//         const agentId = await child.id();
//         const options = {
//           duration: 100,
//           threadId: 10,
//         };

//         const { data, requestId } = await grpcServer.heapProfile(agentId, options);
//         checkProfileError(data.msg, data.metadata, requestId, agentId, 410, 'Thread already gone(1002)');
//         await child.shutdown(0);
//         grpcServer.close();
//         resolve();
//       }));
//     });
//   },
// });

// tests.push({
//   name: 'should return 409 if profile in progress in main thread',
//   test: async () => {
//     return new Promise((resolve) => {
//       const grpcServer = new GRPCServer();
//       grpcServer.start(mustSucceed(async (port) => {
//         const env = {
//           NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
//           NSOLID_GRPC_INSECURE: 1,
//           NSOLID_GRPC: `localhost:${port}`
//         };

//         const opts = {
//           stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
//           env,
//         };
//         const child = new TestClient([], opts);
//         const agentId = await child.id();
//         const options = {
//           duration: 100,
//           threadId: 0,
//         };

//         grpcServer.heapProfile(agentId, options).then(async ({ data, requestId }) => {
//           checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
//           await child.shutdown(0);
//           grpcServer.close();
//           resolve();
//         });
          
//         const { data, requestId } = await grpcServer.heapProfile(agentId, options);
//         checkProfileError(data.msg, data.metadata, requestId, agentId, 409, 'Operation already in progress(1001)');
//       }));
//     });
//   },
// });

// tests.push({
//   name: 'should return 409 if profile in progress in worker',
//   test: async () => {
//     return new Promise((resolve) => {
//       const grpcServer = new GRPCServer();
//       grpcServer.start(mustSucceed(async (port) => {
//         const env = {
//           NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
//           NSOLID_GRPC_INSECURE: 1,
//           NSOLID_GRPC: `localhost:${port}`
//         };

//         const opts = {
//           stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
//           env,
//         };
//         const child = new TestClient([ '-w', 1 ], opts);
//         const agentId = await child.id();
//         const workers = await child.workers();
//         const wid = workers[0];
//         const options = {
//           duration: 100,
//           threadId: wid,
//         };

//         grpcServer.heapProfile(agentId, options).then(async ({ data, requestId }) => {
//           checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
//           await child.shutdown(0);
//           grpcServer.close();
//           resolve();
//         });
          
//         const { data, requestId } = await grpcServer.heapProfile(agentId, options);
//         checkProfileError(data.msg, data.metadata, requestId, agentId, 409, 'Operation already in progress(1001)');
//       }));
//     });
//   },
// });

tests.push({
  name: 'should end an ongoing profile before exiting',
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
          duration: 500,
          threadId: 0,
        };

        grpcServer.heapProfile(agentId, options).then(async ({ data, requestId }) => {
          checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
          await child.shutdown(0);
          grpcServer.close();
          resolve();
        });
          
        await setTimeout(100);
        const exit = await child.shutdown(0);
        assert.ok(exit);
        assert.strictEqual(exit.code, 0);
        assert.strictEqual(exit.signal, null);
      }));
    });
  },
  // test: async (playground) => {
  //   return new Promise((resolve) => {
  //     let events = 0;
  //     let profile = '';
  //     let requestId;
  //     const options = {
  //       duration: 1000,
  //       threadId: 0,
  //     };

  //     let gotExit = false;
  //     let gotProfile = false;
  //     let processExited = false;

  //     const bootstrapOpts = {
  //       // Just to be sure we don't receive the loop_blocked event
  //       opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 } }
  //     };

  //     playground.bootstrap(bootstrapOpts, mustSucceed((agentId) => {
  //       requestId = playground.zmqAgentBus.agentHeapProfileStart(agentId, options);
  //       setTimeout(async () => {
  //         const exit = await playground.client.shutdown(0);
  //         assert.ok(exit);
  //         assert.strictEqual(exit.code, 0);
  //         assert.strictEqual(exit.signal, null);
  //         if (gotProfile && gotExit) {
  //           resolve();
  //         } else {
  //           processExited = true;
  //         }
  //       }, 100);
  //     }), (eventType, agentId, data) => {
  //       if (eventType === 'agent-exit') {
  //         assert.strictEqual(gotExit, false);
  //         checkExitData(data, { exit_code: 0, error: null });
  //         gotExit = true;
  //         if (gotProfile && processExited) {
  //           resolve();
  //         }
  //       } else {
  //         switch (++events) {
  //           case 1:
  //             assert.strictEqual(eventType, 'asset-data-packet');
  //             if (data.packet.length > 0) {
  //               checkProfileData(requestId, options, agentId, data.metadata, false, true);
  //               profile += data.packet;
  //               --events;
  //             } else {
  //               checkProfileData(requestId, options, agentId, data.metadata, true, true);
  //             }
  //             break;
  //           case 2:
  //             assert.strictEqual(gotProfile, false);
  //             assert.strictEqual(eventType, 'asset-received');
  //             checkProfileData(requestId, options, agentId, data, true, true);
  //             JSON.parse(profile);
  //             gotProfile = true;
  //             if (gotExit && processExited) {
  //               resolve();
  //             }
  //         }
  //       }
  //     });
  //   });
  // },
});

for (const { name, test } of tests) {
  console.log(`[heap profile] ${name}`);
  await test();
}
