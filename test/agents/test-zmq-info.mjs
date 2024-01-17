import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { TestPlayground } from '../common/nsolid-zmq-agent/index.js';

// Data has this format:
// {
//   agentId: 'e02f36ca1d154a005c9204ea593c57003a17e0b6',
//   requestId: '0067b635-967d-4bbe-abd3-eb08f0442d4e',
//   command: 'info',
//   recorded: { seconds: 1703092555, nanoseconds: 203389582 },
//   duration: 0,
//   interval: 3000,
//   version: 4,
//   body: {
//     app: 'untitled application',
//     arch: 'x64',
//     cpuCores: 12,
//     cpuModel: 'Intel(R) Core(TM) i7-8750H CPU @ 2.20GHz',
//     execPath: '/home/sgimeno/nodesource/nsolid/out/Release/nsolid',
//     hostname: 'sgimeno-N8xxEZ',
//     id: 'e02f36ca1d154a005c9204ea593c57003a17e0b6',
//     main: '/home/sgimeno/nodesource/nsolid/test/fixtures/nsolid-start.js',
//     nodeEnv: 'prod',
//     pid: 457470,
//     platform: 'linux',
//     processStart: 1703092555126,
//     tags: [],
//     totalMem: 33359147008,
//     versions: {
//       acorn: '8.10.0',
//       ada: '2.7.2',
//       ares: '1.20.1',
//       base64: '0.5.0',
//       brotli: '1.0.9',
//       cjs_module_lexer: '1.2.2',
//       cldr: '43.1',
//       icu: '73.2',
//       llhttp: '8.1.1',
//       modules: '115',
//       napi: '9',
//       nghttp2: '1.57.0',
//       nghttp3: '0.7.0',
//       ngtcp2: '0.8.1',
//       node: '20.10.0',
//       nsolid: '5.0.2-pre',
//       openssl: '3.0.12+quic',
//       simdutf: '3.2.18',
//       tz: '2023c',
//       undici: '5.26.4',
//       unicode: '15.0',
//       uv: '1.46.0',
//       uvwasi: '0.0.19',
//       v8: '11.3.244.8-node.25',
//       zlib: '1.2.13.1-motley'
//     }
//   },
//   time: 1703092555203,
//   timeNS: '1703092555203389582'
// }

function checkInfoData(info, requestId, agentId, nsolidConfig = {}) {
  assert.strictEqual(info.requestId, requestId);
  assert.strictEqual(info.agentId, agentId);
  assert.strictEqual(info.command, 'info');
  // From here check at least that all the fields are present
  assert.ok(info.recorded);
  assert.ok(info.recorded.seconds);
  assert.ok(info.recorded.nanoseconds);
  assert.ok(info.duration != null);
  assert.ok(info.interval);
  assert.ok(info.version);
  assert.ok(info.body);
  assert.ok(info.time);
  // also the body fields
  assert.ok(info.body.app);
  assert.strictEqual(info.body.app, nsolidConfig.appName || 'untitled application');
  assert.ok(info.body.arch);
  assert.ok(info.body.cpuCores);
  assert.ok(info.body.cpuModel);
  assert.ok(info.body.execPath);
  assert.ok(info.body.hostname);
  assert.ok(info.body.id);
  assert.ok(info.body.main);
  assert.strictEqual(info.body.nodeEnv, nsolidConfig.nodeEnv || 'prod');
  assert.ok(info.body.pid);
  assert.ok(info.body.platform);
  assert.ok(info.body.processStart);
  assert.strictEqual(info.body.tags.length, nsolidConfig.tags ? nsolidConfig.tags.length : 0);
  assert.ok(info.body.totalMem);
  assert.deepStrictEqual(info.body.versions, process.versions);
}

const tests = [];

tests.push({
  name: 'should provide default values correctly',
  test: async (playground) => {
    return new Promise((resolve) => {
      playground.bootstrap(mustSucceed((agentId) => {
        const requestId = playground.zmqAgentBus.agentInfoRequest(agentId, mustSucceed((info) => {
          checkInfoData(info, requestId, agentId);
          resolve();
        }));
      }));
    });
  }
});

tests.push({
  name: 'should also work with nsolid configuration',
  test: async (playground) => {
    return new Promise((resolve) => {
      const bootstrapOpts = {
        opts: {
          env: {
            NSOLID_APPNAME: 'myapp',
            NSOLID_TAGS: 'tag1,tag2',
            NODE_ENV: 'dev'
          }
        }
      };

      playground.bootstrap(bootstrapOpts, mustSucceed((agentId) => {
        const requestId = playground.zmqAgentBus.agentInfoRequest(agentId, mustSucceed((info) => {
          const nsolidConfig = {
            appName: 'myapp',
            tags: ['tag1', 'tag2'],
            nodeEnv: 'dev'
          };

          checkInfoData(info, requestId, agentId, nsolidConfig);
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

for (const saas of [false, true]) {
  config.saas = saas;
  const label = saas ? 'saas' : 'local';
  const playground = new TestPlayground(config);
  await playground.startServer();

  for (const { name, test } of tests) {
    console.log(`[${label}] info command ${name}`);
    await test(playground);
    await playground.stopClient();
  }

  await playground.stopServer();
}
