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

function checkReconfigureData(reconfigure, metadata, requestId, agentId, nsolidConfig) {
  // console.dir(reconfigure, { depth: null });
  validateString(reconfigure.common.requestId, 'requestId');
  assert.ok(reconfigure.common.requestId.length > 0);
  if (requestId) {
    assert.strictEqual(reconfigure.common.requestId, requestId);
  }

  assert.strictEqual(reconfigure.common.command, 'reconfigure');
  // From here check at least that all the fields are present
  validateObject(reconfigure.common.recorded, 'recorded');
  const recSeconds = BigInt(reconfigure.common.recorded.seconds);
  assert.ok(recSeconds);
  const recNanoSecs = BigInt(reconfigure.common.recorded.nanoseconds);
  assert.ok(recNanoSecs);

  // Normalize the configuration objects for comparison
  const normalizedReconfigBody = {};
  const normalizedNsolidConfig = {};

  // Process reconfigure.body - remove properties starting with underscore
  for (const [key, value] of Object.entries(reconfigure.body)) {
    if (!key.startsWith('_')) {
      // Convert string numbers to actual numbers for comparison
      if (typeof value === 'string' && !Number.isNaN(Number(value))) {
        normalizedReconfigBody[key] = Number(value);
      } else {
        normalizedReconfigBody[key] = value;
      }
    }
  }

  // Process nsolidConfig - include only keys that exist in normalizedReconfigBody
  for (const key of Object.keys(normalizedReconfigBody)) {
    if (key in nsolidConfig) {
      normalizedNsolidConfig[key] = nsolidConfig[key];
    }
  }

  // Compare the normalized objects
  console.log('Normalized reconfigure body:', normalizedReconfigBody);
  console.log('Normalized nsolid config:', normalizedNsolidConfig);
  assert.deepStrictEqual(normalizedReconfigBody, normalizedNsolidConfig);

  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

const tests = [];

tests.push({
  name: 'should provide current config correctly',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port);
        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const client = new TestClient([], opts);
        const agentId = await client.id();

        // Send reconfigure request and get the response directly
        const { data, requestId } = await grpcServer.reconfigure(agentId);

        // Get the current NSolid configuration
        const nsolidConfig = await client.config();

        // Verify the reconfigure response format
        checkReconfigureData(data.msg, data.metadata, requestId, agentId, nsolidConfig);

        await client.shutdown(0);
        grpcServer.close();
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
  [ 'contCpuProfile', true ],
  [ 'traceSampleRate', 0.4 ],
];

tests.push({
  name: 'should return new config if valid config is provided',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port);
        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };

        const client = new TestClient([], opts);
        const agentId = await client.id();

        // Send each config update one by one
        async function sendConfigs(index) {
          if (index >= newConfigs.length) {
            await client.shutdown(0);
            grpcServer.close();
            resolve();
            return;
          }

          const [key, val] = newConfigs[index];
          console.log(`Testing config update for ${key}: ${val}`);

          const { data, requestId } = await grpcServer.reconfigure(agentId, { [key]: val });

          // Get the current NSolid configuration
          const nsolidConfig = await client.config();

          // Verify the reconfigure response format
          checkReconfigureData(data.msg, data.metadata, requestId, agentId, nsolidConfig);

          // Verify that the specific field has been updated correctly
          console.log(`Checking if ${key} was updated to ${val}`);

          // Compare the values
          assert.deepStrictEqual(
            nsolidConfig[key],
            val,
            `Expected ${key} to be updated to ${val}, but got ${nsolidConfig[key]}`,
          );

          // Move to the next config
          await sendConfigs(index + 1);
        }

        // Start sending configs
        await sendConfigs(0);
      }));
    });
  },
});

tests.push({
  name: 'should preserve previous traceSampleRate for invalid values',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port);
        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };

        const client = new TestClient([], opts);
        const agentId = await client.id();

        await grpcServer.reconfigure(agentId, { traceSampleRate: 0.4 });
        let nsolidConfig = await client.config();
        assert.strictEqual(nsolidConfig.traceSampleRate, 0.4);

        const invalidRates = [2, -0.5];
        for (const invalidRate of invalidRates) {
          await grpcServer.reconfigure(agentId, { traceSampleRate: invalidRate });
          nsolidConfig = await client.config();
          assert.strictEqual(
            nsolidConfig.traceSampleRate,
            0.4,
            `Expected traceSampleRate to remain 0.4 after invalid update ${invalidRate}, got ${nsolidConfig.traceSampleRate}`,
          );
        }

        await client.shutdown(0);
        grpcServer.close();
        resolve();
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
    console.log(`[reconfigure] ${name}`);
    await test(testConfig.getEnv);
  }
}
