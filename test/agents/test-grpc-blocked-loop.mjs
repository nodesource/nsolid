// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { threadId } from 'node:worker_threads';
import validators from 'internal/validators';
import {
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

const {
  validateArray,
  validateInteger,
  validateObject,
  validateString,
} = validators;

// Data has this format:
// blocked: {
//   common: {
//     requestId: '',
//     command: 'loop_blocked',
//     recorded: { seconds: '1727454294', nanoseconds: '87260880' },
//     error: null
//   },
//   body: {
//     stack: [
//       {
//         isEval: false,
//         scriptName: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/client.js',
//         functionName: 'blockFor',
//         lineNumber: 78,
//         column: 3
//       },
//       {
//         isEval: false,
//         scriptName: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/client.js',
//         functionName: '',
//         lineNumber: 102,
//         column: 9
//       },
//       {
//         isEval: false,
//         scriptName: 'node:events',
//         functionName: 'emit',
//         lineNumber: 519,
//         column: 28
//       },
//       {
//         isEval: false,
//         scriptName: 'node:internal/child_process',
//         functionName: 'emit',
//         lineNumber: 951,
//         column: 14
//       },
//       {
//         isEval: false,
//         scriptName: 'node:internal/process/task_queues',
//         functionName: 'processTicksAndRejections',
//         lineNumber: 83,
//         column: 21
//       }
//     ],
//     threadId: '0',
//     blockedFor: 145,
//     loopId: 2,
//     callbackCntr: 2
//   }
// },
function checkBlockedLoopData(blocked, metadata, agentId, threadId) {
  console.dir(blocked, { depth: null });
  validateString(blocked.common.requestId, 'common.requestId');
  assert.strictEqual(blocked.common.command, 'loop_blocked');
  // From here check at least that all the fields are present
  validateObject(blocked.common.recorded, 'recorded');
  const recSeconds = BigInt(blocked.common.recorded.seconds);
  assert.ok(recSeconds);
  const recNanoSecs = BigInt(blocked.common.recorded.nanoseconds);
  assert.ok(recNanoSecs);
  validateObject(blocked.body, 'body');
  // also the body fields
  validateInteger(blocked.body.blockedFor, 'blockedFor');
  validateInteger(blocked.body.loopId, 'loopId');
  validateInteger(blocked.body.callbackCntr, 'callbackCntr');
  validateArray(blocked.body.stack, 'stack');
  for (const frame of blocked.body.stack) {
    validateObject(frame, 'frame');
    validateString(frame.scriptName, 'scriptName');
    if (frame.function_name !== null) {
      validateString(frame.functionName, 'functionName');
    }

    validateInteger(frame.lineNumber, 'lineNumber');
    validateInteger(frame.column, 'column');
    validateInteger(frame.scriptId, 'scriptId');
  }

  assert.strictEqual(blocked.body.threadId, `${threadId}`);
  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

// Data has this format:
// {
//   blocked: {
//     common: {
//       requestId: '',
//       command: 'loop_unblocked',
//       recorded: { seconds: '1727455387', nanoseconds: '215486545' },
//       error: null
//     },
//     body: { threadId: '0', blockedFor: 401, loopId: 2, callbackCntr: 2 }
//   },
//   metadata: {
//     'user-agent': [ 'grpc-c++/1.65.2 grpc-c/42.0.0 (linux; chttp2)' ],
//     'nsolid-agent-id': [ 'fe7031a042d87300c5a00d0b2e4ae7000b4e3be2' ]
//   }
// }
function checkUnblockedLoopData(blocked, metadata, agentId, threadId, bInfo) {
  console.dir(blocked, { depth: null });
  validateString(blocked.common.requestId, 'common.requestId');
  assert.strictEqual(blocked.common.command, 'loop_unblocked');
  // From here check at least that all the fields are present
  validateObject(blocked.common.recorded, 'recorded');
  const recSeconds = BigInt(blocked.common.recorded.seconds);
  assert.ok(recSeconds);
  const recNanoSecs = BigInt(blocked.common.recorded.nanoseconds);
  assert.ok(recNanoSecs);
  validateObject(blocked.body, 'body');
  // also the body fields
  validateInteger(blocked.body.blockedFor, 'blockedFor');
  validateInteger(blocked.body.loopId, 'loopId');
  validateInteger(blocked.body.callbackCntr, 'callbackCntr');

  assert.strictEqual(blocked.body.threadId, `${threadId}`);
  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}


const tests = [];

tests.push({
  name: 'should work in the main thread with default threshold of 200ms',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      let times = 0;
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('loop_blocked', mustCall(async (data) => {
          checkBlockedLoopData(data.msg, data.metadata, agentId, threadId);
        }, 2));

        grpcServer.on('loop_unblocked', mustCall(async (data) => {
          checkUnblockedLoopData(data.msg, data.metadata, agentId, threadId);
          if (++times === 2) {
            await child.shutdown(0);
            grpcServer.close();
            resolve();
          } else {
            await child.block(0, 400);
          }
        }, 2));

        const env = getEnv(port);

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        await child.block(0, 400);
      }));
    });
  },
});

tests.push({
  name: 'should work in the main thread with different threshold',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('loop_blocked', mustCall(async (data) => {
          checkBlockedLoopData(data.msg, data.metadata, agentId, threadId);
        }));

        grpcServer.on('loop_unblocked', mustCall(async (data) => {
          checkUnblockedLoopData(data.msg, data.metadata, agentId, threadId);
          await child.shutdown(0);
          grpcServer.close();
          resolve();
        }));

        const env = getEnv(port);

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env: {
            ...env,
            NSOLID_BLOCKED_LOOP_THRESHOLD: '1000',
          },
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        await child.block(0, 400);
        setTimeout(() => {
          child.block(0, 1500);
        }, 500);
      }));
    });
  },
});

tests.push({
  name: 'should work for workers with default threshold of 200ms',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      let times = 0;
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('loop_blocked', mustCall(async (data) => {
          checkBlockedLoopData(data.msg, data.metadata, agentId, wid);
        }, 2));

        grpcServer.on('loop_unblocked', mustCall(async (data) => {
          checkUnblockedLoopData(data.msg, data.metadata, agentId, wid);
          if (++times === 2) {
            await child.shutdown(0);
            grpcServer.close();
            resolve();
          } else {
            await child.block(wid, 800);
          }
        }, 2));

        const env = getEnv(port);

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([ '-w', 1 ], opts);
        const agentId = await child.id();
        const workers = await child.workers();
        const wid = workers[0];
        await child.block(wid, 400);
      }));
    });
  },
});

tests.push({
  name: 'should work for workers with different threshold',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('loop_blocked', mustCall(async (data) => {
          checkBlockedLoopData(data.msg, data.metadata, agentId, wid);
        }));

        grpcServer.on('loop_unblocked', mustCall(async (data) => {
          checkUnblockedLoopData(data.msg, data.metadata, agentId, wid);
          await child.shutdown(0);
          grpcServer.close();
          resolve();
        }));

        const env = getEnv(port);

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env: {
            ...env,
            NSOLID_BLOCKED_LOOP_THRESHOLD: '1000',
          },
        };
        const child = new TestClient([ '-w', 1 ], opts);
        const agentId = await child.id();
        const workers = await child.workers();
        const wid = workers[0];
        await child.block(wid, 400);
        setTimeout(() => {
          child.block(wid, 1500);
        }, 500);
      }));
    });
  },
});

const testConfigs = [
  {
    getEnv: (port) => {
      return {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_GRPC: `localhost:${port}`,
      };
    },
  },
  {
    getEnv: (port) => {
      return {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_SAAS: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbtesting.localhost:${port}`,
      };
    },
  },
];

for (const testConfig of testConfigs) {
  for (const { name, test } of tests) {
    console.log(`blocked loop generation ${name}`);
    await test(testConfig.getEnv);
  }
}
