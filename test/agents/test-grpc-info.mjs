// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isMainThread, Worker } from 'node:worker_threads';
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
      tracingEnabled: false,
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
          NSOLID_GRPC: `localhost:${port}`,
        };
      },
      nsolidConfig: {},
    },
    {
      getEnv: (port) => {
        return {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`,
          NSOLID_APPNAME: 'myapp',
          NSOLID_TAGS: 'tag1,tag2',
          NODE_ENV: 'dev',
        };
      },
      nsolidConfig: {
        appName: 'myapp',
        tags: ['tag1', 'tag2'],
        nodeEnv: 'dev',
      },
    },
  ];

  for (const testConfig of testConfigs) {
    await runTest(testConfig);
    console.log('run test!');
  }
}
