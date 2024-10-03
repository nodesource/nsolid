// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isMainThread, threadId, Worker } from 'node:worker_threads';
import nsolid from 'nsolid';
import {
  GRPCServer,
} from '../common/nsolid-grpc-agent/index.js';

const __filename = fileURLToPath(import.meta.url);

if (process.argv[2] === 'child') {
  // Just to keep the worker alive.
  setInterval(() => {
  }, 1000);

  if (isMainThread) {
    nsolid.start({
      tracingEnabled: false
    });

    const worker = new Worker(__filename, { argv: ['child'] });
    process.send({ type: 'workerThreadId', id: worker.threadId });
    process.send({
      type: 'nsolid',
      id: nsolid.id,
      appName: nsolid.appName,
    });
    process.on('message', (message) => {
      assert.strictEqual(message, 'exit');
      process.exit(0);
    });
  }
} else {

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
  function checkInfoData(msg, metadata, requestId, agentId, nsolidConfig = {}) {
    const info = msg;
    assert.strictEqual(info.common.requestId, requestId);
    assert.strictEqual(info.common.command, 'info');
    assert.strictEqual(info.common.error, null);
    assert.strictEqual(info.body.id, agentId);
    assert.ok(info.common.recorded);
    assert.ok(info.common.recorded.seconds);
    assert.ok(info.common.recorded.nanoseconds);
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
    assert.ok(metadata['user-agent']);
    assert.ok(metadata['nsolid-agent-id']);
    assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
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
        const child = fork(__filename, ['child'], opts);
        child.on('message', async (message) => {
          console.log('message', message);
          if (message.type === 'nsolid') {
            const agentId = message.id;
            const { data, requestId } = await grpcServer.info(agentId);
            checkInfoData(data.msg, data.metadata, requestId, agentId, nsolidConfig);
            console.dir(data, { depth: null });
            child.send('exit');
          }
        });

        child.on('exit', (code, signal) => {
          console.log(`child process exited with code ${code} and signal ${signal}`);
          grpcServer.close();
          resolve();
        });
      }));
    });
  }

  const testConfigs = [
    {
      getEnv: (port) => {
        return {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`
        };
      },
      nsolidConfig: {}
    },
    {
      getEnv: (port) => {
        return {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`,
          NSOLID_APPNAME: 'myapp',
          NSOLID_TAGS: 'tag1,tag2',
          NODE_ENV: 'dev'
        };
      },
      nsolidConfig: {
        appName: 'myapp',
        tags: ['tag1', 'tag2'],
        nodeEnv: 'dev'
      }
    }
  ];

  for (const testConfig of testConfigs) {
    await runTest(testConfig);
    console.log('run test!');
  }
}
