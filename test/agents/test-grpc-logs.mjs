// Flags: --expose-internals
import { mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { threadId } from 'node:worker_threads';
import validators from 'internal/validators';
import {
  checkResource,
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

const {
  validateArray,
  validateInteger,
  validateObject,
  validateString,
} = validators;

// Data has this format:
// {
//   resourceLogs: [
//     {
//       scopeLogs: [
//         {
//           logRecords: [
//             {
//               attributes: [],
//               timeUnixNano: '1729691509680922662',
//               severityNumber: 'SEVERITY_NUMBER_WARN',
//               severityText: 'WARN',
//               body: { stringValue: 'my warn message', value: 'stringValue' },
//               droppedAttributesCount: 0,
//               flags: 0,
//               traceId: { type: 'Buffer', data: [] },
//               spanId: { type: 'Buffer', data: [] },
//               observedTimeUnixNano: '1729691509680922662'
//             }
//           ],
//           scope: {
//             attributes: [],
//             name: 'nsolid',
//             version: 'v20.18.0+nsv5.3.5-pre',
//             droppedAttributesCount: 0
//           },
//           schemaUrl: ''
//         }
//       ],
//       resource: {
//         attributes: [
//           {
//             key: 'telemetry.sdk.version',
//             value: { stringValue: '1.16.0', value: 'stringValue' }
//           },
//           {
//             key: 'telemetry.sdk.language',
//             value: { stringValue: 'cpp', value: 'stringValue' }
//           },
//           {
//             key: 'telemetry.sdk.name',
//             value: { stringValue: 'opentelemetry', value: 'stringValue' }
//           },
//           {
//             key: 'service.instance.id',
//             value: {
//               stringValue: '1c7617d3b6d261003ccb0348965fbe00fe56d3ba',
//               value: 'stringValue'
//             }
//           },
//           {
//             key: 'service.name',
//             value: {
//               stringValue: 'untitled application',
//               value: 'stringValue'
//             }
//           }
//         ],
//         droppedAttributesCount: 0
//       },
//       schemaUrl: ''
//     }
//   ]
// }

const logRecords = [];
const expectedLevels = [ 'debug', 'error', 'fatal', 'info', 'warn' ];
const expectedLevelsUpper = [ 'DEBUG', 'ERROR', 'FATAL', 'INFO', 'WARN' ];

function checkLogRecords(logRecords) {
  console.dir(logRecords, { depth: null });
  // As logRecords doesn't have a strict order, order it based on severityText
  logRecords.sort((a, b) => a.severityText.localeCompare(b.severityText));
  for (let i = 0; i < logRecords.length; i++) {
    const logRecord = logRecords[i];
    validateArray(logRecord.attributes, 'attributes');
    assert.strictEqual(logRecord.attributes.length, 0);
    validateString(logRecord.body.stringValue, `my ${expectedLevels[i]} message`);
    validateString(logRecord.severityNumber, `SEVERITY_NUMBER_${expectedLevelsUpper[i]}`);
    validateString(logRecord.severityText, expectedLevelsUpper[i]);
    validateInteger(logRecord.droppedAttributesCount, 'droppedAttributesCount');
    assert.strictEqual(logRecord.droppedAttributesCount, 0);
    validateInteger(logRecord.flags, 'flags');
    assert.strictEqual(logRecord.flags, 0);
    validateObject(logRecord.traceId, 'traceId');
    assert.strictEqual(logRecord.traceId.type, 'Buffer');
    assert.strictEqual(logRecord.traceId.data.length, 0);
    validateObject(logRecord.spanId, 'spanId');
    assert.strictEqual(logRecord.spanId.type, 'Buffer');
    assert.strictEqual(logRecord.spanId.data.length, 0);
    validateString(logRecord.timeUnixNano, 'timeUnixNano');
    validateString(logRecord.observedTimeUnixNano, 'observedTimeUnixNano');
  }
}

function checkScope(scope) {
  validateArray(scope.attributes, 'attributes');
  assert.strictEqual(scope.attributes.length, 0);
  validateString(scope.name, 'nsolid');
  validateString(scope.version, `${process.version}+nsv${process.versions.nsolid}`);
  validateInteger(scope.droppedAttributesCount, 'droppedAttributesCount');
  assert.strictEqual(scope.droppedAttributesCount, 0);
}


function checkLogsData(logs, agentId, threadId, config) {
  const resourceLogs = logs.resourceLogs;
  validateArray(resourceLogs, 'resourceLogs');
  assert.strictEqual(resourceLogs.length, 1);
  checkResource(resourceLogs[0].resource, agentId, config);
  for (const scopeLog of resourceLogs[0].scopeLogs) {
    logRecords.push(...scopeLog.logRecords);
    checkScope(scopeLog.scope);
  }

  if (logRecords.length === 5) {
    checkLogRecords(logRecords);
    return true;
  }

  return false;
}

const tests = [];

tests.push({
  name: 'should work in the main thread',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('logs', mustCallAtLeast(async (data) => {
          const done = checkLogsData(data, agentId, threadId, config);
          if (done) {
            logRecords.splice(0);
            await child.shutdown(0);
            grpcServer.close();
            resolve();
          }
        }));

        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`,
          NSOLID_BLOCKED_LOOP_THRESHOLD: 100,
        };

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        const config = await child.config();
        await child.log(threadId, 'debug', 'my debug message');
        await child.log(threadId, 'info', 'my info message');
        await child.log(threadId, 'warn', 'my warn message');
        await child.log(threadId, 'error', 'my error message');
        await child.log(threadId, 'fatal', 'my fatal message');
      }));
    });
  },
});

tests.push({
  name: 'should work for workers',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('logs', mustCallAtLeast(async (data) => {
          const done = checkLogsData(data, agentId, threadId, config);
          if (done) {
            logRecords.splice(0);
            await child.shutdown(0);
            grpcServer.close();
            resolve();
          }
        }));

        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`,
          NSOLID_BLOCKED_LOOP_THRESHOLD: 100,
        };

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([ '-w', 1 ], opts);
        const agentId = await child.id();
        const workers = await child.workers();
        const wid = workers[0];
        const config = await child.config();
        await child.log(wid, 'debug', 'my debug message');
        await child.log(wid, 'info', 'my info message');
        await child.log(wid, 'warn', 'my warn message');
        await child.log(wid, 'error', 'my error message');
        await child.log(wid, 'fatal', 'my fatal message');
      }));
    });
  },
});

for (const { name, test } of tests) {
  console.log(`logging ${name}`);
  await test();
}
