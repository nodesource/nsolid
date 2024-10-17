// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { setTimeout } from 'node:timers/promises';
import {
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';
import validators from 'internal/validators';

const {
  validateArray,
  validateBoolean,
  validateString,
  validateNumber,
  validateObject,
  validateUint32
} = validators;

// Data has this format:
    //   msg: {
    //     common: {
    //   requestId: '783db171-b5b8-445b-9978-7e1189d49f79',
    //   command: 'info',
    //   recorded: { seconds: '1727428715', nanoseconds: '496676353' },
    //   error: null
    // },
    // body: {
    //   tags: [],
    //   versions: {
    //     cldr: '45.0',
    //     ares: '1.32.3',
    //     v8: '11.3.244.8-node.23',
    //     tz: '2024a',
    //     uvwasi: '0.0.21',
    //     node: '20.17.0',
    //     unicode: '15.1',
    //     ada: '2.9.0',
    //     openssl: '3.0.13+quic',
    //     modules: '115',
    //     nsolid: '5.3.4-pre',
    //     nghttp2: '1.61.0',
    //     brotli: '1.1.0',
    //     zlib: '1.3.0.1-motley-209717d',
    //     nghttp3: '0.7.0',
    //     simdutf: '5.3.0',
    //     base64: '0.5.2',
    //     ngtcp2: '1.1.0',
    //     uv: '1.46.0',
    //     cjs_module_lexer: '1.2.2',
    //     undici: '6.19.2',
    //     icu: '75.1',
    //     napi: '9',
    //     acorn: '8.11.3',
    //     llhttp: '8.1.2'
    //   },
    //   app: 'untitled application',
    //   arch: 'x64',
    //   cpuCores: 12,
    //   cpuModel: 'Intel(R) Core(TM) i7-8750H CPU @ 2.20GHz',
    //   execPath: '/home/sgimeno/nodesource/nsolid/out/Release/nsolid',
    //   hostname: 'sgimeno-N8xxEZ',
    //   id: '404fca2b96a429003f053b747f355f00652c26b1',
    //   main: '/home/sgimeno/nodesource/nsolid/test/agents/test-grpc-info.mjs',
    //   nodeEnv: 'prod',
    //   pid: 166811,
    //   platform: 'linux',
    //   processStart: '1727428715390',
    //   totalMem: '33362350080'
    // }
//   },
//   metadata: {
//     'user-agent': [ 'grpc-c++/1.65.2 grpc-c/42.0.0 (linux; chttp2)' ],
//     'nsolid-agent-id': [ 'bfb0abf94bc01900281c6be9c8c3480032909614' ]
//   }
function checkMetricsData(msg, metadata, requestId, agentId, nsolidConfig = {}) {
  const info = msg;
  assert.strictEqual(info.common.requestId, requestId);
  assert.strictEqual(info.common.command, 'metrics');
  assert.strictEqual(info.common.error, null);
}

async function runTest({ getEnv, nsolidConfig }) {
  return new Promise((resolve, reject) => {
    const grpcServer = new GRPCServer();
    grpcServer.start(mustSucceed(async (port) => {
      console.log('GRPC server started', port);
      const env = getEnv(port);
      const opts = {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env,
      };
      const child = new TestClient([], opts);
      const agentId = await child.id();
      await setTimeout(100);
      const { data, requestId } = await grpcServer.metrics(agentId);
      checkMetricsData(data.msg, data.metadata, requestId, agentId, nsolidConfig);
      await child.shutdown(0);
      grpcServer.close();
      resolve();
    }));
  });
}

const testConfigs = [
  {
    getEnv: (port) => {
      return {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_GRPC: `localhost:${port}`,
        NSOLID_INTERVAL: 100,
      };
    },
    nsolidConfig: {}
  },
];

for (const testConfig of testConfigs) {
  await runTest(testConfig);
  console.log('run test!');
}
