// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { once } from 'node:events';
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

function checkPingData(data, requestId, agentId, version = 4) {
  console.dir(data, { depth: null });
  assert.strictEqual(data.requestId, requestId);
  assert.strictEqual(data.agentId, agentId);
  assert.strictEqual(data.app, 'untitled application');
  assert.strictEqual(data.command, 'ping');
  // From here check at least that all the fields are present
  validateObject(data.recorded, 'recorded');
  validateUint32(data.recorded.seconds, 'recorded.seconds');
  validateUint32(data.recorded.nanoseconds, 'recorded.nanoseconds');
  validateUint32(data.duration, 'duration');
  validateUint32(data.interval, 'interval');
  assert.strictEqual(data.version, version);
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
  },
});

tests.push({
  name: 'should reject malformed commands and remain alive',
  test: mustCall(async (playground) => {
    const agentId = await new Promise((resolve) => {
      playground.bootstrap(mustSucceed(resolve));
    });
    const messages = [
      '{', 'null', '[]', '{}',
      JSON.stringify({ command: 'ping', version: 4 }),
      JSON.stringify({ requestId: 'invalid', version: 4 }),
      JSON.stringify({ command: 42, requestId: 'invalid', version: 4 }),
      JSON.stringify({ command: 'ping', requestId: 42, version: 4 }),
      JSON.stringify({ command: 'ping', requestId: 'embedded\0nul', version: 4 }),
      JSON.stringify({ command: 'ping', requestId: 'invalid', version: '4' }),
      JSON.stringify({ command: 'ping', requestId: 'invalid', version: 4, cancel: 'yes' }),
      JSON.stringify({ command: 'xping', requestId: 'invalid', version: 4, args: { restart: 'yes' } }),
      ...[[], [1], 42, 'invalid', true].map((args) =>
        JSON.stringify({ command: 'reconfigure', requestId: 'invalid', version: 4, args })),
      JSON.stringify({ config: null }),
      JSON.stringify({ config: { version: '4' } }),
      JSON.stringify({ config: { sockets: [] } }),
      ...['commandBindAddr', 'dataBindAddr', 'bulkBindAddr'].map((field) =>
        JSON.stringify({ config: { sockets: { [field]: 42 } } })),
    ];
    for (const message of messages) {
      console.log(`Malformed ZMQ command: ${message}`);
      const rejected = once(playground.zmqAgentBus, 'error:undefined');
      playground.zmqAgentBus.server.command.socket.send([`id:${agentId}`, message]);
      const [err] = await rejected;
      assert.strictEqual(err.code, 400);
      assert.strictEqual(err.message, 'invalid command');
      await new Promise((resolve) => {
        const requestId = playground.zmqAgentBus.agentPingRequest(
          agentId, mustSucceed((ping) => {
            checkPingData(ping, requestId, agentId);
            resolve();
          }));
      });
    }
  }),
});

tests.push({
  name: 'should preserve escaped request IDs in replies',
  test: mustCall(async (playground) => {
    const agentId = await new Promise((resolve) => {
      playground.bootstrap(mustSucceed(resolve));
    });
    const requestId = 'quote"backslash\\newline\ncontrol\x1f';
    await new Promise((resolve) => {
      playground.zmqAgentBus._sendCB({
        id: agentId, command: 'ping', requestId,
      }, mustSucceed((ping) => {
        checkPingData(ping, requestId, agentId);
        resolve();
      }));
    });
    await new Promise((resolve) => {
      playground.zmqAgentBus._sendCB({
        id: agentId, command: 'reconfigure', requestId, args: { assetsEnabled: 'yes' },
      }, mustCall((err) => {
        assert.strictEqual(err.code, 422);
        resolve();
      }));
    });
  }),
});

tests.push({
  name: 'should preserve the negotiated version when omitted',
  test: async (playground) => {
    const agentId = await new Promise((resolve) => {
      playground.bootstrap(mustSucceed(resolve));
    });
    let expectedVersion = 4;
    for (const version of [undefined, 3, undefined, 4, undefined]) {
      if (version !== undefined) expectedVersion = version;
      await new Promise((resolve) => {
        const requestId = playground.zmqAgentBus._sendCB(
          { id: agentId, command: 'ping', version }, mustSucceed((ping) => {
            checkPingData(ping, requestId, agentId, expectedVersion);
            resolve();
          }));
      });
    }
  },
});

const config = {
  commandBindAddr: 'tcp://*:9001',
  dataBindAddr: 'tcp://*:9002',
  bulkBindAddr: 'tcp://*:9003',
  HWM: 0,
  bulkHWM: 0,
  commandTimeoutMilliseconds: 5000,
  saas: false,
};

const playground = new TestPlayground(config);
await playground.startServer();

for (const { name, test } of tests) {
  console.log(`[local] ping command ${name}`);
  await test(playground);
  await playground.stopClient();
}

await playground.stopServer();
