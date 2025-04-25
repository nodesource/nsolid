// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import { fixturesDir } from '../common/fixtures.mjs';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
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

function checkSourceCodeData(sourceCode, metadata, requestId, agentId, options) {
  // console.dir(sourceCode, { depth: null });
  validateString(sourceCode.common.requestId, 'requestId');
  assert.ok(sourceCode.common.requestId.length > 0);
  if (requestId) {
    assert.strictEqual(sourceCode.common.requestId, requestId);
  }

  assert.strictEqual(sourceCode.common.command, 'source_code');
  // From here check at least that all the fields are present
  validateObject(sourceCode.common.recorded, 'recorded');
  const recSeconds = BigInt(sourceCode.common.recorded.seconds);
  assert.ok(recSeconds);
  const recNanoSecs = BigInt(sourceCode.common.recorded.nanoseconds);
  assert.ok(recNanoSecs);

  assert.toString(sourceCode.threadId, options.threadId);
  assert.strictEqual(sourceCode.path, options.path);
  let realPath = options.path;
  if (realPath.startsWith('file://')) {
    realPath = fileURLToPath(realPath);
  }

  if (realPath.startsWith('data:text/javascript,')) {
    assert.strictEqual(sourceCode.code, realPath.substring(21));
  } else {
    assert.strictEqual(fs.readFileSync(realPath).toString(), sourceCode.code);
  }


  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

function checkSourceCodeError(sourceCode, metadata, requestId, agentId, code, msg) {
  console.dir(sourceCode, { depth: null });
  assert.strictEqual(sourceCode.common.requestId, requestId);
  assert.strictEqual(sourceCode.common.command, 'source_code');
  // From here check at least that all the fields are present
  validateObject(sourceCode.common.recorded, 'recorded');
  const recSeconds = BigInt(sourceCode.common.recorded.seconds);
  assert.ok(recSeconds);
  const recNanoSecs = BigInt(sourceCode.common.recorded.nanoseconds);
  assert.ok(recNanoSecs);

  validateObject(sourceCode.common.error, 'error');
  assert.strictEqual(sourceCode.common.error.code, code);
  assert.strictEqual(sourceCode.common.error.message, msg);

  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

const tests = [];

tests.push({
  name: 'should work for both cjs and esm scripts and fail for non-existent scripts on the main thread',
  test: async () => {
    return new Promise((resolve) => {
      const importPath = path.join(fixturesDir, 'nsolid-source-code', 'index.mjs');
      const esmPath = path.join(fixturesDir, 'nsolid-source-code', 'esm.mjs');
      const commonPath = path.join(fixturesDir, 'nsolid-source-code', 'common.js');
      const importPathUrl = pathToFileURL(importPath).toString();
      const esmPathUrl = pathToFileURL(esmPath).toString();
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('loop_blocked', mustCall(async (data) => {
          console.dir(data.msg, { depth: null });
          const scripts = [];
          for (const frame of data.msg.body.stack) {
            if (frame.scriptName.includes('client.js') ||
                frame.scriptName.includes(importPathUrl) ||
                frame.scriptName.includes(esmPathUrl) ||
                frame.scriptName.includes(commonPath)) {
              scripts.push({
                scriptId: frame.scriptId,
                path: frame.scriptName,
              });
            }
          }

          assert.strictEqual(scripts.length, 4);
          for (const { scriptId, path } of scripts) {
            const options = {
              threadId: 0,
              scriptId,
              path,
            };

            const ret = await grpcServer.sourceCode(agentId, options);
            checkSourceCodeData(ret.data.msg, ret.data.metadata, ret.requestId, agentId, options);
          }

          // It should fail for a non-existent script
          {
            const options = {
              threadId: 0,
              scriptId: 0,
              path: 'non-existent',
            };

            const ret = await grpcServer.sourceCode(agentId, options);
            checkSourceCodeError(ret.data.msg,
                                 ret.data.metadata,
                                 ret.requestId,
                                 agentId,
                                 500,
                                 'Internal Runtime Error(1007)');
          }

          // It should also fail for a non-existent scriptId
          {
            const options = {
              threadId: 0,
              scriptId: 10000,
              path: scripts[0].path,
            };

            const ret = await grpcServer.sourceCode(agentId, options);
            checkSourceCodeError(ret.data.msg,
                                 ret.data.metadata,
                                 ret.requestId,
                                 agentId,
                                 500,
                                 'Internal Runtime Error(1007)');
          }

          // It should also fail for a non-existent thread
          {
            const options = {
              threadId: 23,
              scriptId: 10000,
              path: scripts[0].path,
            };

            const ret = await grpcServer.sourceCode(agentId, options);
            checkSourceCodeError(ret.data.msg,
                                 ret.data.metadata,
                                 ret.requestId,
                                 agentId,
                                 410,
                                 'Thread already gone(1002)');
          }

          await child.shutdown(0);
          grpcServer.close();
          resolve();
        }));

        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`,
        };

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        await child.importURL(importPath, 0);
      }));
    });
  },
});

tests.push({
  name: 'should work for both cjs and esm scripts and fail for non-existent scripts on a worker thread',
  test: async () => {
    return new Promise((resolve) => {
      const importPath = path.join(fixturesDir, 'nsolid-source-code', 'index.mjs');
      const esmPath = path.join(fixturesDir, 'nsolid-source-code', 'esm.mjs');
      const commonPath = path.join(fixturesDir, 'nsolid-source-code', 'common.js');
      const importPathUrl = pathToFileURL(importPath).toString();
      const esmPathUrl = pathToFileURL(esmPath).toString();
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('loop_blocked', mustCall(async (data) => {
          console.dir(data.msg, { depth: null });
          const scripts = [];
          for (const frame of data.msg.body.stack) {
            if (frame.scriptName.includes('client.js') ||
                frame.scriptName.includes(importPathUrl) ||
                frame.scriptName.includes(esmPathUrl) ||
                frame.scriptName.includes(commonPath)) {
              scripts.push({
                scriptId: frame.scriptId,
                path: frame.scriptName,
              });
            }
          }

          assert.strictEqual(scripts.length, 4);
          for (const { scriptId, path } of scripts) {
            const options = {
              threadId: wid,
              scriptId,
              path,
            };

            const ret = await grpcServer.sourceCode(agentId, options);
            checkSourceCodeData(ret.data.msg, ret.data.metadata, ret.requestId, agentId, options);
          }

          // It should fail for a non-existent script
          {
            const options = {
              threadId: wid,
              scriptId: 0,
              path: 'non-existent',
            };

            const ret = await grpcServer.sourceCode(agentId, options);
            checkSourceCodeError(ret.data.msg,
                                 ret.data.metadata,
                                 ret.requestId,
                                 agentId,
                                 500,
                                 'Internal Runtime Error(1007)');
          }

          // It should also fail for a non-existent scriptId
          {
            const options = {
              threadId: wid,
              scriptId: 10000,
              path: scripts[0].path,
            };

            const ret = await grpcServer.sourceCode(agentId, options);
            checkSourceCodeError(ret.data.msg,
                                 ret.data.metadata,
                                 ret.requestId,
                                 agentId,
                                 500,
                                 'Internal Runtime Error(1007)');
          }

          await child.shutdown(0);
          grpcServer.close();
          resolve();
        }));

        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`,
        };

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([ '-w', 1 ], opts);
        const agentId = await child.id();
        const workers = await child.workers();
        const wid = workers[0];
        await child.importURL(importPath, wid);
      }));
    });
  },
});

tests.push({
  name: 'should also work for imported data urls',
  test: async () => {
    return new Promise((resolve) => {
      const importPath = path.join(fixturesDir, 'nsolid-source-code', 'data.mjs');
      const importPathUrl = pathToFileURL(importPath).toString();
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('loop_blocked', mustCall(async (data) => {
          console.dir(data.msg, { depth: null });
          const scripts = [];
          for (const frame of data.msg.body.stack) {
            if (frame.scriptName.includes(importPathUrl) ||
                frame.scriptName.startsWith('data:text/javascript,')) {
              scripts.push({
                scriptId: frame.scriptId,
                path: frame.scriptName,
              });
            }
          }

          assert.strictEqual(scripts.length, 2);
          for (const { scriptId, path } of scripts) {
            const options = {
              threadId: 0,
              scriptId,
              path,
            };

            const ret = await grpcServer.sourceCode(agentId, options);
            checkSourceCodeData(ret.data.msg, ret.data.metadata, ret.requestId, agentId, options);
          }

          await child.shutdown(0);
          grpcServer.close();
          resolve();
        }));

        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`,
        };

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        await child.importURL(importPath, 0);
      }));
    });
  },
});


for (const { name, test } of tests) {
  console.log(`[source code] ${name}`);
  await test();
}
