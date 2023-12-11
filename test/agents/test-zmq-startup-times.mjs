// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import validators from 'internal/validators';
import { TestPlayground } from '../common/nsolid-zmq-agent/index.js';

const {
  validateArray,
  validateInteger,
  validateObject,
  validateUint32,
} = validators;


//  Data has this format:
//  {
//   agentId: '67c1a5e7d9b6520045a0f61e5c87c3009fc9f355',
//   requestId: '3d3604f6-ed11-4e76-91c4-efb5258e96e0',
//   command: 'startup_times',
//   recorded: { seconds: 1703094691, nanoseconds: 64236343 },
//   duration: 0,
//   interval: 3000,
//   version: 4,
//   body: {
//     bootstrap_complete: [ 0, 17975160 ],
//     initialized_node: [ 0, 433754 ],
//     initialized_v8: [ 0, 2678126 ],
//     loaded_environment: [ 0, 8218223 ],
//     loop_start: [ 0, 22997344 ],
//     timeOrigin: [ 0, 0 ]
//   },
//   time: 1703094691064,
//   timeNS: '1703094691064236343'
// }

function checkStartupTimesData(data, requestId, agentId, additionalTimes = []) {
  assert.strictEqual(data.requestId, requestId);
  assert.strictEqual(data.agentId, agentId);
  assert.strictEqual(data.command, 'startup_times');
  // From here check at least that all the fields are present
  validateObject(data.recorded, 'recorded');
  validateUint32(data.recorded.seconds, 'recorded.seconds');
  validateUint32(data.recorded.nanoseconds, 'recorded.nanoseconds');
  validateUint32(data.duration, 'duration');
  validateUint32(data.interval, 'interval');
  assert.strictEqual(data.version, 4);
  validateObject(data.body, 'body');
  validateInteger(data.time, 'time');
  // Also the body fields
  assert.ok(data.body.initialized_node);
  assert.ok(data.body.initialized_v8);
  assert.ok(data.body.loaded_environment);
  assert.ok(data.body.loop_start);
  assert.ok(data.body.timeOrigin);
  additionalTimes.forEach((time) => assert.ok(data.body[time]));
  Object.keys(data.body).forEach((key) => {
    validateArray(data.body[key], `data.body.${key}`);
    assert.strictEqual(data.body[key].length, 2);
    validateUint32(data.body[key][0], `data.body.${key}[0]`);
    validateUint32(data.body[key][1], `data.body.${key}[1]`);
  });
}

const tests = [];

tests.push({
  name: 'should work with the default values',
  test: async (playground) => {
    return new Promise((resolve) => {
      playground.bootstrap(mustSucceed((agentId) => {
        const requestId = playground.zmqAgentBus.agentStartupTimesRequest(agentId, mustSucceed((info) => {
          checkStartupTimesData(info, requestId, agentId);
          resolve();
        }));
      }));
    });
  }
});

tests.push({
  name: 'should work with the custom times',
  test: async (playground) => {
    return new Promise((resolve) => {
      playground.bootstrap(mustSucceed(async (agentId) => {
        assert.ok(await playground.client.startupTimes('customTime'));
        const requestId = playground.zmqAgentBus.agentStartupTimesRequest(agentId, mustSucceed((info) => {
          checkStartupTimesData(info, requestId, agentId, [ 'customTime' ]);
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
  console.log(`startup times command ${name}`);
  await test(playground);
  await playground.stopClient();
}

playground.stopServer();
