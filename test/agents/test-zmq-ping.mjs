// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import validators from 'internal/validators';
import { TestPlayground } from '../common/nsolid-zmq-agent/index.js';

const {
  validateBoolean,
  validateInteger,
  validateObject,
  validateUint32,
} = validators;

// Data has this format:
// {
//   agentId: 'b41f52d0cf1e2100affbd3a0c2766200cb2f7427',
//   requestId: '81ca8fa0-03a4-4051-a017-c6fc659aea3a',
//   command: 'ping',
//   recorded: { seconds: 1703172421, nanoseconds: 333469660 },
//   duration: 0,
//   interval: 3000,
//   version: 4,
//   body: { pong: true },
//   time: 1703172421333,
//   timeNS: '1703172421333469660'
// }

function checkPingData(data, requestId, agentId) {
  console.dir(data, { depth: null });
  assert.strictEqual(data.requestId, requestId);
  assert.strictEqual(data.agentId, agentId);
  assert.strictEqual(data.command, 'ping');
  // From here check at least that all the fields are present
  validateObject(data.recorded, 'recorded');
  validateUint32(data.recorded.seconds, 'recorded.seconds');
  validateUint32(data.recorded.nanoseconds, 'recorded.nanoseconds');
  validateUint32(data.duration, 'duration');
  validateUint32(data.interval, 'interval');
  assert.strictEqual(data.version, 4);
  validateObject(data.body, 'body');
  validateInteger(data.time, 'time');
  // also the body fields
  validateBoolean(data.body.pong, 'body.pong');
  assert.ok(data.body.pong);
}

const tests = [];

tests.push({
  name: 'should just work',
  test: async (playground) => {
    return new Promise((resolve) => {
      playground.bootstrap(mustSucceed((agentId) => {
        const requestId =
          playground.zmqAgentBus.agentPingRequest(agentId, mustSucceed((ping) => {
            checkPingData(ping, requestId, agentId);
            resolve();
          }));
      }));
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
  console.log(`ping command ${name}`);
  await test(playground);
  await playground.stopClient();
}

playground.stopServer();
