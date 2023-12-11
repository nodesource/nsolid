// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { threadId } from 'node:worker_threads';
import validators from 'internal/validators';
import { TestPlayground } from '../common/nsolid-zmq-agent/index.js';

const {
  validateArray,
  validateInteger,
  validateObject,
  validateString,
  validateUint32,
} = validators;

// Data has this format:
// {
//   agentId: 'a6349a3418a928009e64672ea6c35400226e035f',
//   requestId: null,
//   command: 'loop_blocked',
//   recorded: { seconds: 1705427872, nanoseconds: 886283288 },
//   duration: 0,
//   interval: 3000,
//   version: 4,
//   body: {
//     blocked_for: 134,
//     loop_id: 2,
//     callback_cntr: 1,
//     stack: [
//       {
//         is_eval: false,
//         script_name: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-zmq-agent/client.js',
//         function_name: null,
//         line_number: 93,
//         column: 7
//       },
//       {
//         is_eval: false,
//         script_name: 'node:events',
//         function_name: 'emit',
//         line_number: 518,
//         column: 28
//       },
//       {
//         is_eval: false,
//         script_name: 'node:internal/child_process',
//         function_name: 'emit',
//         line_number: 951,
//         column: 14
//       },
//       {
//         is_eval: false,
//         script_name: 'node:internal/process/task_queues',
//         function_name: 'processTicksAndRejections',
//         line_number: 83,
//         column: 21
//       }
//     ]
//   },
//   time: 1705427872886,
//   timeNS: '1705427872886283288'
// }
function checkBlockedLoopData(blocked, agentId, threadId) {
  console.dir(blocked, { depth: null });
  assert.strictEqual(blocked.requestId, null);
  assert.strictEqual(blocked.agentId, agentId);
  assert.strictEqual(blocked.command, 'loop_blocked');
  // From here check at least that all the fields are present
  validateObject(blocked.recorded, 'recorded');
  validateUint32(blocked.recorded.seconds, 'recorded.seconds');
  validateUint32(blocked.recorded.nanoseconds, 'recorded.nanoseconds');
  validateUint32(blocked.duration, 'duration');
  validateUint32(blocked.interval, 'interval');
  assert.strictEqual(blocked.version, 4);
  validateObject(blocked.body, 'body');
  validateInteger(blocked.time, 'time');
  // also the body fields
  validateInteger(blocked.body.blocked_for, 'blocked_for');
  validateInteger(blocked.body.loop_id, 'loop_id');
  validateInteger(blocked.body.callback_cntr, 'callback_cntr');
  validateArray(blocked.body.stack, 'stack');
  for (const frame of blocked.body.stack) {
    validateObject(frame, 'frame');
    validateString(frame.script_name, 'script_name');
    if (frame.function_name !== null) {
      validateString(frame.function_name, 'function_name');
    }

    validateInteger(frame.line_number, 'line_number');
    validateInteger(frame.column, 'column');
  }

  assert.strictEqual(blocked.body.threadId, threadId);
}

// Data has this format:
// {
//   agentId: '0fc6f773f8854000a1c6717af3e79500836567a4',
//   requestId: null,
//   command: 'loop_unblocked',
//   recorded: { seconds: 1705428376, nanoseconds: 685445475 },
//   duration: 0,
//   interval: 3000,
//   version: 4,
//   body: { blocked_for: 150, loop_id: 2, callback_cntr: 1 },
//   time: 1705428376685,
//   timeNS: '1705428376685445475'
// }
function checkUnblockedLoopData(blocked, agentId, threadId, bInfo) {
  console.dir(blocked, { depth: null });
  assert.strictEqual(blocked.requestId, null);
  assert.strictEqual(blocked.agentId, agentId);
  assert.strictEqual(blocked.command, 'loop_unblocked');
  // From here check at least that all the fields are present
  validateObject(blocked.recorded, 'recorded');
  validateUint32(blocked.recorded.seconds, 'recorded.seconds');
  validateUint32(blocked.recorded.nanoseconds, 'recorded.nanoseconds');
  validateUint32(blocked.duration, 'duration');
  validateUint32(blocked.interval, 'interval');
  assert.strictEqual(blocked.version, 4);
  validateObject(blocked.body, 'body');
  validateInteger(blocked.time, 'time');
  // also the body fields
  validateInteger(blocked.body.blocked_for, 'blocked_for');
  validateInteger(blocked.body.loop_id, 'loop_id');
  validateInteger(blocked.body.callback_cntr, 'callback_cntr');

}


const tests = [];

tests.push({
  name: 'should work in the main thread',
  test: async (playground) => {
    return new Promise((resolve) => {
      let events = 0;
      let bInfo = null;
      const opts = {
        opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 100 } }
      };

      playground.bootstrap(opts, mustSucceed(async (agentId) => {
        await playground.client.block(threadId, 400);
      }), mustCall((eventType, agentId, data) => {
        console.log(`${eventType}, ${agentId}`);
        switch (++events) {
          case 1:
            assert.strictEqual(eventType, 'agent-loop_blocked');
            checkBlockedLoopData(data, agentId, threadId);
            bInfo = {
              blocked_for: data.body.blocked_for,
              loop_id: data.body.loop_id,
              callback_cntr: data.body.callback_cntr
            };
            break;
          case 2:
            assert.strictEqual(eventType, 'agent-loop_unblocked');
            checkUnblockedLoopData(data, agentId, threadId, bInfo);
            resolve();
            break;
        }
      }, 2));
    });
  }
});

tests.push({
  name: 'should work for http transactions on a worker',
  test: async (playground) => {
    return new Promise((resolve) => {
      let wid;
      let events = 0;
      let bInfo = null;
      const opts = {
        args: [ '-w', 1 ],
        opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 100 } }
      };

      playground.bootstrap(opts, mustSucceed(async (agentId) => {
        const workers = await playground.client.workers();
        wid = workers[0];
        await playground.client.block(wid, 400);
      }), mustCall((eventType, agentId, data) => {
        console.log(`${eventType}, ${agentId}`);
        switch (++events) {
          case 1:
            assert.strictEqual(eventType, 'agent-loop_blocked');
            checkBlockedLoopData(data, agentId, wid);
            bInfo = {
              blocked_for: data.body.blocked_for,
              loop_id: data.body.loop_id,
              callback_cntr: data.body.callback_cntr
            };
            break;
          case 2:
            assert.strictEqual(eventType, 'agent-loop_unblocked');
            checkUnblockedLoopData(data, agentId, wid, bInfo);
            resolve();
            break;
        }
      }, 2));
    });
  }
});


const config = {
  commandBindAddr: 'tcp://*:9001',
  dataBindAddr: 'tcp://*:9002',
  bulkBindAddr: 'tcp://*:9003',
  HWM: 0,
  bulkHWM: 0,
  commandTimeoutMilliseconds: 5000
};


const playground = new TestPlayground(config);
await playground.startServer();

for (const { name, test } of tests) {
  console.log(`blocked loop generation ${name}`);
  await test(playground);
  await playground.stopClient();
}

playground.stopServer();
