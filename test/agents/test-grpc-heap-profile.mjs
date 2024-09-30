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
  assert.deepStrictEqual(profile.metadata, options.metadata);
  validateString(profile.data, 'profile.data');
  validateObject(JSON.parse(profile.data), 'JSON(profile.data)');

  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

const tests = [];
const trackAllocations = [false, true];
for (const track of trackAllocations) {
  // tests.push({
  //   name: `should work for the main thread with trackAllocations=${track}`,
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
  //           metadata: {
  //             fields: {
  //               a: {
  //                 stringValue: 'x',
  //                 kind: 'stringValue'
  //               }
  //             }
  //           },
  //           heapProfile: {
  //             trackAllocations: track
  //           }
  //         };

  //         const { data, requestId } = await grpcServer.heapProfile(agentId, options);
  //         checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
  //         await child.shutdown(0);
  //         grpcServer.close();
  //         resolve();
  //       }));
  //     });
  //   },
  // });

  tests.push({
    name: `should work for worker threads with trackAllocations=${track}`,
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
            heapProfile: {
              trackAllocations: track
            }
          };

          const { data, requestId } = await grpcServer.heapProfile(agentId, options);
          checkProfileData(data.msg, data.metadata, requestId, agentId, options, true);
          await child.shutdown(0);
          grpcServer.close();
          resolve();
        }));
      });
    },
  });

  // tests.push({
  //   name: `should work for worker threads with trackAllocations=${track}`,
  //   test: async (playground) => {
  //     return new Promise((resolve) => {
  //       let events = 0;
  //       let profile = '';
  //       let requestId;
  //       const options = {
  //         duration: 100,
  //         trackAllocations: track,
  //       };

  //       const bootstrapOpts = {
  //         args: [ '-w', 1 ],
  //         // Just to be sure we don't receive the loop_blocked event
  //         opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 } }
  //       };

  //       playground.bootstrap(bootstrapOpts, mustSucceed(async (agentId) => {
  //         // Need to get the id's of the worker threads from the metrics first.
  //         const workers = await playground.client.workers();
  //         options.threadId = workers[0];
  //         requestId = playground.zmqAgentBus.agentHeapProfileStart(agentId, options);
  //       }), (eventType, agentId, data) => {
  //         console.log(`[${eventType}] ${agentId}}`);
  //         switch (++events) {
  //           case 1:
  //             assert.strictEqual(eventType, 'asset-data-packet');
  //             if (data.packet.length > 0) {
  //               checkProfileData(requestId, options, agentId, data.metadata, false);
  //               profile += data.packet;
  //               --events;
  //             } else {
  //               checkProfileData(requestId, options, agentId, data.metadata, true);
  //             }
  //             break;
  //           case 2:
  //           {
  //             assert.strictEqual(eventType, 'asset-received');
  //             checkProfileData(requestId, options, agentId, data, true);
  //             const heapProf = JSON.parse(profile);
  //             if (track === true) {
  //               assert.ok(heapProf.snapshot.trace_function_count > 0);
  //               assert.ok(heapProf.trace_function_infos.length > 0);
  //               assert.ok(heapProf.trace_tree.length > 0);
  //             } else {
  //               assert.strictEqual(heapProf.snapshot.trace_function_count, 0);
  //               assert.strictEqual(heapProf.trace_function_infos.length, 0);
  //               assert.strictEqual(heapProf.trace_tree.length, 0);
  //             }
  //             resolve();
  //           }
  //         }
  //       });
  //     });
  //   },
  // });
}

// tests.push({
//   name: 'should return 410 if sent to a non-existant thread',
//   test: async (playground) => {
//     return new Promise((resolve) => {
//       const options = {
//         duration: 100,
//         threadId: 10,
//       };

//       playground.bootstrap(mustSucceed((agentId) => {
//         playground.zmqAgentBus.agentHeapProfileStart(agentId, options, mustCall((err) => {
//           assert.strictEqual(err.code, 410);
//           assert.strictEqual(err.message, 'Thread already gone');
//           resolve();
//         }));
//       }));
//     });
//   },
// });

// tests.push({
//   name: 'should return 422 if invalid threadId field',
//   test: async (playground) => {
//     return new Promise((resolve) => {
//       const options = {
//         duration: 100,
//         threadId: 'wth',
//       };

//       playground.bootstrap(mustSucceed((agentId) => {
//         playground.zmqAgentBus.agentHeapProfileStart(agentId, options, mustCall((err) => {
//           assert.strictEqual(err.code, 422);
//           assert.strictEqual(err.message, 'Invalid arguments');
//           resolve();
//         }));
//       }));
//     });
//   },
// });

// tests.push({
//   name: 'should return 422 if invalid duration field',
//   test: async (playground) => {
//     return new Promise((resolve) => {
//       const options = {
//         duration: 'wth',
//       };

//       playground.bootstrap(mustSucceed((agentId) => {
//         playground.zmqAgentBus.agentHeapProfileStart(agentId, options, mustCall((err) => {
//           assert.strictEqual(err.code, 422);
//           assert.strictEqual(err.message, 'Invalid arguments');
//           resolve();
//         }));
//       }));
//     });
//   },
// });

// tests.push({
//   name: 'should return 422 if invalid trackAllocations field',
//   test: async (playground) => {
//     return new Promise((resolve) => {
//       const options = {
//         trackAllocations: 'wth',
//       };

//       playground.bootstrap(mustSucceed((agentId) => {
//         playground.zmqAgentBus.agentHeapProfileStart(agentId, options, mustCall((err) => {
//           assert.strictEqual(err.code, 422);
//           assert.strictEqual(err.message, 'Invalid arguments');
//           resolve();
//         }));
//       }));
//     });
//   },
// });

// tests.push({
//   name: 'should return 422 no args field',
//   test: async (playground) => {
//     return new Promise((resolve) => {
//       const options = null;

//       playground.bootstrap(mustSucceed((agentId) => {
//         playground.zmqAgentBus.agentHeapProfileStart(agentId, options, mustCall((err) => {
//           assert.strictEqual(err.code, 422);
//           assert.strictEqual(err.message, 'Invalid arguments');
//           resolve();
//         }));
//       }));
//     });
//   },
// });

// tests.push({
//   name: 'should return 409 if profile in progress in main thread',
//   test: async (playground) => {
//     return new Promise((resolve) => {
//       let events = 0;
//       let profile = '';
//       let requestId;
//       const options = {
//         duration: 100,
//         threadId: 0,
//       };

//       const bootstrapOpts = {
//         // Just to be sure we don't receive the loop_blocked event
//         opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 } }
//       };

//       playground.bootstrap(bootstrapOpts, mustSucceed((agentId) => {
//         requestId = playground.zmqAgentBus.agentHeapProfileStart(agentId, options);
//         playground.zmqAgentBus.agentHeapProfileStart(agentId, options, mustCall((err) => {
//           assert.strictEqual(err.code, 409);
//           assert.strictEqual(err.message, 'Profile already in progress');
//         }));
//       }), (eventType, agentId, data) => {
//         switch (++events) {
//           case 1:
//             assert.strictEqual(eventType, 'asset-data-packet');
//             if (data.packet.length > 0) {
//               checkProfileData(requestId, options, agentId, data.metadata, false);
//               profile += data.packet;
//               --events;
//             } else {
//               checkProfileData(requestId, options, agentId, data.metadata, true);
//             }
//             break;
//           case 2:
//             assert.strictEqual(eventType, 'asset-received');
//             checkProfileData(requestId, options, agentId, data, true);
//             JSON.parse(profile);
//             resolve();
//         }
//       });
//     });
//   },
// });

// tests.push({
//   name: 'should return 409 if profile in progress in worker',
//   test: async (playground) => {
//     return new Promise((resolve) => {
//       let events = 0;
//       let profile = '';
//       let requestId;
//       const options = {
//         duration: 100,
//       };

//       const bootstrapOpts = {
//         args: [ '-w', 1 ],
//         // Just to be sure we don't receive the loop_blocked event
//         opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 } }
//       };

//       playground.bootstrap(bootstrapOpts, mustSucceed(async (agentId) => {
//         // Need to get the id's of the worker threads from the metrics first.
//         const workers = await playground.client.workers();
//         options.threadId = workers[0];
//         requestId = playground.zmqAgentBus.agentHeapProfileStart(agentId, options);
//         playground.zmqAgentBus.agentHeapProfileStart(agentId, options, mustCall((err) => {
//           assert.strictEqual(err.code, 409);
//           assert.strictEqual(err.message, 'Profile already in progress');
//         }));
//       }), (eventType, agentId, data) => {
//         switch (++events) {
//           case 1:
//             assert.strictEqual(eventType, 'asset-data-packet');
//             if (data.packet.length > 0) {
//               checkProfileData(requestId, options, agentId, data.metadata, false);
//               profile += data.packet;
//               --events;
//             } else {
//               checkProfileData(requestId, options, agentId, data.metadata, true);
//             }
//             break;
//           case 2:
//             assert.strictEqual(eventType, 'asset-received');
//             checkProfileData(requestId, options, agentId, data, true);
//             JSON.parse(profile);
//             resolve();
//         }
//       });
//     });
//   },
// });

// tests.push({
//   name: 'should end an ongoing profile before exiting',
//   test: async (playground) => {
//     return new Promise((resolve) => {
//       let events = 0;
//       let profile = '';
//       let requestId;
//       const options = {
//         duration: 1000,
//         threadId: 0,
//       };

//       let gotExit = false;
//       let gotProfile = false;
//       let processExited = false;

//       const bootstrapOpts = {
//         // Just to be sure we don't receive the loop_blocked event
//         opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 } }
//       };

//       playground.bootstrap(bootstrapOpts, mustSucceed((agentId) => {
//         requestId = playground.zmqAgentBus.agentHeapProfileStart(agentId, options);
//         setTimeout(async () => {
//           const exit = await playground.client.shutdown(0);
//           assert.ok(exit);
//           assert.strictEqual(exit.code, 0);
//           assert.strictEqual(exit.signal, null);
//           if (gotProfile && gotExit) {
//             resolve();
//           } else {
//             processExited = true;
//           }
//         }, 100);
//       }), (eventType, agentId, data) => {
//         if (eventType === 'agent-exit') {
//           assert.strictEqual(gotExit, false);
//           checkExitData(data, { exit_code: 0, error: null });
//           gotExit = true;
//           if (gotProfile && processExited) {
//             resolve();
//           }
//         } else {
//           switch (++events) {
//             case 1:
//               assert.strictEqual(eventType, 'asset-data-packet');
//               if (data.packet.length > 0) {
//                 checkProfileData(requestId, options, agentId, data.metadata, false, true);
//                 profile += data.packet;
//                 --events;
//               } else {
//                 checkProfileData(requestId, options, agentId, data.metadata, true, true);
//               }
//               break;
//             case 2:
//               assert.strictEqual(gotProfile, false);
//               assert.strictEqual(eventType, 'asset-received');
//               checkProfileData(requestId, options, agentId, data, true, true);
//               JSON.parse(profile);
//               gotProfile = true;
//               if (gotExit && processExited) {
//                 resolve();
//               }
//           }
//         }
//       });
//     });
//   },
// });

for (const { name, test } of tests) {
  console.log(`[heap profile] ${name}`);
  await test();
}
