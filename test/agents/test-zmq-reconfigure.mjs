// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { once } from 'node:events';
import validators from 'internal/validators';
import { TestPlayground } from '../common/nsolid-zmq-agent/index.js';

const {
  validateInteger,
  validateObject,
  validateUint32,
} = validators;

// Data has this format:
// {
//   agentId: '523e62bcab8e56003929af2dcb7381002f471c29',
//   requestId: 'f4e9d0b7-754d-44ba-922e-b68136b1921e',
//   command: 'reconfigure',
//   recorded: { seconds: 1704814130, nanoseconds: 273547654 },
//   duration: 0,
//   interval: 3000,
//   version: 4,
//   body: {
//     blockedLoopThreshold: 200,
//     interval: 3000,
//     pauseMetrics: false,
//     promiseTracking: false,
//     statsdBucket: 'nsolid.${env}.${app}.${hostname}.${shortId}',
//     tags: [],
//     tracingEnabled: false,
//     tracingModulesBlacklist: 0
//   },
//   time: 1704814130274,
//   timeNS: '1704814130273547654'
// }

function checkReconfigureData(reconfigure, requestId, agentId, nsolidConfig) {
  assert.strictEqual(reconfigure.requestId, requestId);
  assert.strictEqual(reconfigure.agentId, agentId);
  assert.strictEqual(reconfigure.app, 'untitled application');
  assert.strictEqual(reconfigure.command, 'reconfigure');
  // From here check at least that all the fields are present
  validateObject(reconfigure.recorded, 'recorded');
  validateUint32(reconfigure.recorded.seconds, 'recorded.seconds');
  validateUint32(reconfigure.recorded.nanoseconds, 'recorded.nanoseconds');
  validateUint32(reconfigure.duration, 'duration');
  validateUint32(reconfigure.interval, 'interval');
  assert.strictEqual(reconfigure.version, 4);
  validateObject(reconfigure.body, 'body');
  validateInteger(reconfigure.time, 'time');
  // also the body fields
  const allowedKeys = [
    'assetsEnabled', 'blockedLoopThreshold', 'interval', 'pauseMetrics',
    'promiseTracking', 'redactSnapshots', 'statsd', 'statsdBucket',
    'statsdTags', 'tags', 'tracingEnabled', 'tracingModulesBlacklist',
  ];
  const expectedConfig = Object.fromEntries(
    Object.entries(nsolidConfig).filter(([key]) => allowedKeys.includes(key)));
  assert.deepStrictEqual(reconfigure.body, expectedConfig);
  for (const key of ['saas', 'otlpConfig', 'pubkey']) {
    assert.strictEqual(Object.hasOwn(reconfigure.body, key), false);
  }
}

const tests = [];

tests.push({
  name: 'should provide current config correctly',
  test: async (playground) => {
    return new Promise((resolve) => {
      playground.bootstrap(mustSucceed((agentId) => {
        const requestId = playground.zmqAgentBus.agentReconfigureRequest(agentId, null, mustSucceed(async (reconf) => {
          const nsolidConfig = await playground.client.config();
          checkReconfigureData(reconf, requestId, agentId, nsolidConfig);
          resolve();
        }));
      }));
    });
  },
});

async function sendReconfigure(zmqAgentBus, agentId, config) {
  return new Promise((resolve, reject) => {
    const requestId = zmqAgentBus.agentReconfigureRequest(agentId, config, (err, reconfigure) => {
      if (err) {
        reject(err);
      } else {
        resolve({ requestId, reconfigure });
      }
    });
  });
}

const validationErrors = [
  [ { blockedLoopThreshold: '3000' }, "'blockedLoopThreshold' should be an unsigned int" ],
  [ { interval: '3000' }, "'interval' should be an unsigned int" ],
  [ { pauseMetrics: 'yes' }, "'pauseMetrics' should be a boolean" ],
  [ { promiseTracking: 'yes' }, "'promiseTracking' should be a boolean" ],
  [ { redactSnapshots: 'yes' }, "'redactSnapshots' should be a boolean" ],
  [ { statsd: true }, "'statsd' should be a string" ],
  [ { statsdBucket: true }, "'statsdBucket' should be a string" ],
  [ { statsdTags: true }, "'statsdTags' should be a string" ],
  [ { tags: 'yes' }, "'tags' should be an array of strings" ],
  [ { tags: [ true ] }, "'tags' should be an array of strings" ],
  [ { tracingEnabled: 'yes' }, "'tracingEnabled' should be a boolean" ],
  [ { tracingModulesBlacklist: 'yes' }, "'tracingModulesBlacklist' should be an unsigned int" ],
];

tests.push({
  name: 'should return validation error if invalid config is provided',
  test: async (playground) => {
    return new Promise((resolve) => {
      playground.bootstrap(mustSucceed(async (agentId) => {
        for (const [config, errorMsg] of validationErrors) {
          await assert.rejects(async () => {
            await sendReconfigure(playground.zmqAgentBus, agentId, config);
          }, {
            code: 422,
            message: errorMsg,
          });
        }

        resolve();
      }));
    });
  },
});

const newConfigs = [
  [ 'blockedLoopThreshold', 8000 ],
  [ 'interval', 5000 ],
  [ 'pauseMetrics', true ],
  [ 'promiseTracking', true ],
  [ 'redactSnapshots', true ],
  [ 'statsd', 'localhost:8125' ],
  // eslint-disable-next-line no-template-curly-in-string
  [ 'statsdBucket', 'nsolidtest.${env}.${app}.${hostname}.${shortId}' ],
  [ 'statsdTags', 'tag1,tag2' ],
  [ 'tags', [ 'tag1', 'tag2' ] ],
  [ 'tracingEnabled', true ],
  [ 'tracingModulesBlacklist', 1 ],
];

tests.push({
  name: 'should return new config if valid config is provided',
  test: async (playground) => {
    return new Promise((resolve) => {
      playground.bootstrap(mustSucceed(async (agentId) => {
        for (const [key, val] of newConfigs) {
          const { requestId, reconfigure } = await sendReconfigure(playground.zmqAgentBus, agentId, { [key]: val });
          assert.deepStrictEqual(reconfigure.body[key], val);
          const nsolidConfig = await playground.client.config();
          checkReconfigureData(reconfigure, requestId, agentId, nsolidConfig);
        }

        resolve();
      }));
    });
  },
});

tests.push({
  name: 'should resume periodic metrics after removing pauseMetrics',
  test: async (playground) => {
    return new Promise((resolve) => {
      let reconfigured = false;
      let metrics = 0;
      const opts = { opts: { env: { NSOLID_INTERVAL: '3600000' } } };
      playground.bootstrap(opts, mustSucceed(async () => {
        const child = playground.client.child();
        for (const config of [
          { pauseMetrics: true },
          { pauseMetrics: null, interval: 50, app: 'resumed-metrics' },
        ]) {
          const reply = once(child, 'message');
          child.send({ type: 'nativeConfig', config });
          const [msg] = await reply;
          assert.strictEqual(msg.type, 'nativeConfig');
        }
        reconfigured = true;
      }), (eventType, agentId, data) => {
        if (reconfigured && eventType === 'agent-metrics' &&
            data.app === 'resumed-metrics' && ++metrics === 2) {
          resolve();
        }
      });
    });
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
  console.log(`[local] reconfigure command ${name}`);
  await test(playground);
  await playground.stopClient();
}

await playground.stopServer();
