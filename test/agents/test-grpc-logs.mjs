// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { threadId } from 'node:worker_threads';
import {
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

const sampleLogs = [
  ['debug', 'my debug message'],
  ['info', 'my info message'],
  ['warn', 'my warn message'],
  ['error', 'my error message'],
  ['fatal', 'my fatal message'],
];

async function sendSampleLogs(child, id) {
  for (const [level, message] of sampleLogs) {
    await child.log(id, level, message);
  }
}

function createLogsCollector(grpcServer) {
  const events = [];
  grpcServer.on('logs', (data) => {
    events.push(data);
  });

  return () => events;
}

function extractLogMessages(logEvents) {
  const messages = [];
  for (const event of logEvents) {
    for (const resourceLog of event.resourceLogs || []) {
      for (const scopeLog of resourceLog.scopeLogs || []) {
        for (const record of scopeLog.logRecords || []) {
          const body = record.body;
          if (body && typeof body.stringValue === 'string') {
            messages.push(body.stringValue);
          }
        }
      }
    }
  }
  return messages;
}

async function assertNoLogExportsAfterCleanExit(child, getLogEvents) {
  const { code, signal } = await child.shutdown(0);
  assert.strictEqual(code, 0);
  assert.strictEqual(signal, null);

  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.strictEqual(getLogEvents().length, 0);
}

async function assertCrashLogsAfterErrorExit(
  child,
  getLogEvents,
  exception = false,
) {
  const { code, signal } = exception ?
    await child.exception('msg') :
    await child.shutdown(1);
  assert.strictEqual(code, 1);
  assert.strictEqual(signal, null);

  await new Promise((resolve) => setTimeout(resolve, 200));
  const logEvents = getLogEvents();
  assert.ok(logEvents.length >= 1);
  const messages = extractLogMessages(logEvents);
  for (const [, message] of sampleLogs) {
    assert.ok(messages.includes(message), `missing crash log for: ${message}`);
  }
}

const tests = [];

tests.push({
  name: 'should not export logs in the main thread on clean exit',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const getLogEvents = createLogsCollector(grpcServer);

        const env = getEnv(port);
        const opts = { env };
        const child = new TestClient([], opts);
        await child.id();
        await sendSampleLogs(child, threadId);
        await assertNoLogExportsAfterCleanExit(child, getLogEvents);
        grpcServer.close();
        resolve();
      }));
    });
  },
});

tests.push({
  name: 'should not export logs for workers on clean exit',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const getLogEvents = createLogsCollector(grpcServer);

        const env = getEnv(port);
        const opts = { env };
        const child = new TestClient([ '-w', 1 ], opts);
        await child.id();
        const workers = await child.workers();
        const wid = workers[0];
        await sendSampleLogs(child, wid);
        await assertNoLogExportsAfterCleanExit(child, getLogEvents);
        grpcServer.close();
        resolve();
      }));
    });
  },
});

tests.push({
  name: 'should flush buffered logs on non-zero exit',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const getLogEvents = createLogsCollector(grpcServer);

        const env = getEnv(port);
        const opts = { env };
        const child = new TestClient([], opts);
        await child.id();
        await sendSampleLogs(child, threadId);
        await assertCrashLogsAfterErrorExit(child, getLogEvents);
        grpcServer.close();
        resolve();
      }));
    });
  },
});

tests.push({
  name: 'should flush buffered logs on exception exit',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const getLogEvents = createLogsCollector(grpcServer);

        const env = getEnv(port);
        const opts = { env };
        const child = new TestClient([], opts);
        await child.id();
        await sendSampleLogs(child, threadId);
        await assertCrashLogsAfterErrorExit(child,
                                            getLogEvents,
                                            true);
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
        NSOLID_BLOCKED_LOOP_THRESHOLD: 100,
      };
    },
  },
  {
    getEnv: (port) => {
      return {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_SAAS: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbtesting.localhost:${port}`,
        NSOLID_BLOCKED_LOOP_THRESHOLD: 100,
      };
    },
  },
];

for (const testConfig of testConfigs) {
  for (const { name, test } of tests) {
    console.log(`[logs] ${name}`);
    await test(testConfig.getEnv);
  }
}
