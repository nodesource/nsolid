// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
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
//     app: 'untitled application',
//     blockedLoopThreshold: 200,
//     command: 'localhost:9001',
//     disablePackageScan: false,
//     env: 'prod',
//     hostname: 'sgimeno-N8xxEZ',
//     iisNode: false,
//     interval: 3000,
//     pauseMetrics: false,
//     promiseTracking: false,
//     pubkey: 'oX1><^wd#q69Kh2NqT<EXtO*baE8^^f=VS<P[5ek',
//     statsdBucket: 'nsolid.${env}.${app}.${hostname}.${shortId}',
//     tags: [],
//     tracingEnabled: false,
//     tracingModulesBlacklist: 0,
//     trackGlobalPackages: false
//   },
//   time: 1704814130274,
//   timeNS: '1704814130273547654'
// }

function checkReconfigureData(reconfigure, requestId, agentId, nsolidConfig) {
  assert.strictEqual(reconfigure.requestId, requestId);
  assert.strictEqual(reconfigure.agentId, agentId);
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
  assert.deepStrictEqual(reconfigure.body, nsolidConfig);
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
  }
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
            message: errorMsg
          });
        }

        resolve();
      }));
    });
  }
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


for (const saas of [false, true]) {
  config.saas = saas;
  const label = saas ? 'saas' : 'local';
  const playground = new TestPlayground(config);
  await playground.startServer();

  for (const { name, test } of tests) {
    console.log(`[${label}] reconfigure command ${name}`);
    await test(playground);
    await playground.stopClient();
  }

  await playground.stopServer();
}
