// Flags: --expose-internals
import { mustCall, mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import http from 'node:http';
import { fileURLToPath } from 'url';
import { isMainThread, parentPort, threadId, Worker } from 'node:worker_threads';
import nsolid from 'nsolid';
import validators from 'internal/validators';

import {
  OTLPServer,
} from '../common/nsolid-otlp-agent/index.js';

const {
  validateArray,
  validateString,
} = validators;

let httpPort;

const __filename = fileURLToPath(import.meta.url);

async function execHttpTransaction() {
  const server = http.createServer(mustCall((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello World\n');
  }));

  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      httpPort = server.address().port;
      const req = http.request({
        host: '127.0.0.1',
        port: httpPort,
        method: 'GET',
        path: '/',
      }, (res) => {
        res.on('data', () => {
        });
        res.on('end', () => {
          server.close();
          resolve();
        });
      });
      req.on('error', (error) => {
        reject(error);
      });
      req.end();
    });
  });
}

if (!isMainThread) {
  await execHttpTransaction();
  parentPort.postMessage({ type: 'port', port: httpPort });
  process.exit(0);
}

function checkResource(resource) {
  validateArray(resource.attributes, 'resource.attributes');
  assert.strictEqual(resource.attributes.length, 5);
}

// Check the spans received from agent
// This is an example:
// [
//   {
//     spans: [
//       {
//         traceId: 'o1Qubio+/W+revoB38u9BQ==',
//         spanId: 'OFNtlRBHP94=',
//         parentSpanId: 'gFoe1g7q9M8=',
//         name: 'HTTP GET',
//         kind: 'SPAN_KIND_SERVER',
//         startTimeUnixNano: '1711457458845000000',
//         endTimeUnixNano: '1711457458846703125',
//         attributes: [
//           { key: 'http.method', value: { stringValue: 'GET' } },
//           { key: 'http.status_code', value: { intValue: '200' } },
//           { key: 'http.status_text', value: { stringValue: 'OK' } },
//           {
//             key: 'http.url',
//             value: { stringValue: 'http://127.0.0.1:34475/' }
//           },
//           { key: 'thread.id', value: { intValue: '1' } }
//         ]
//       },
//       {
//         traceId: 'o1Qubio+/W+revoB38u9BQ==',
//         spanId: 'gFoe1g7q9M8=',
//         name: 'HTTP GET',
//         kind: 'SPAN_KIND_CLIENT',
//         startTimeUnixNano: '1711457458838000000',
//         endTimeUnixNano: '1711457458847791259',
//         attributes: [
//           { key: 'http.method', value: { stringValue: 'GET' } },
//           { key: 'http.status_code', value: { intValue: '200' } },
//           { key: 'http.status_text', value: { stringValue: 'OK' } },
//           {
//             key: 'http.url',
//             value: { stringValue: 'http://127.0.0.1:34475/' }
//           },
//           { key: 'thread.id', value: { intValue: '1' } }
//         ]
//       }
//     ]
//   }
// ]
function checkSpans(spans, threadId, port) {
  // console.dir(spans, { depth: null });
  assert.ok(spans);
  validateArray(spans, 'spans');
  assert.strictEqual(spans.length, 2);

  const serverSpan = spans[0];
  validateString(serverSpan.traceId, 'serverSpan.traceId');
  validateString(serverSpan.spanId, 'serverSpan.spanId');
  validateString(serverSpan.parentSpanId, 'serverSpan.parentSpanId');
  assert.strictEqual(serverSpan.name, 'HTTP GET');
  assert.strictEqual(serverSpan.kind, 'SPAN_KIND_SERVER');
  const startTimeUnixNano = BigInt(serverSpan.startTimeUnixNano);
  assert.ok(startTimeUnixNano);
  const endTimeUnixNano = BigInt(serverSpan.endTimeUnixNano);
  assert.ok(endTimeUnixNano);
  validateArray(serverSpan.attributes, 'serverSpan.attributes');
  assert.strictEqual(serverSpan.attributes.length, 5);
  assert.strictEqual(serverSpan.attributes[0].key, 'http.method');
  assert.strictEqual(serverSpan.attributes[0].value.stringValue, 'GET');
  assert.strictEqual(serverSpan.attributes[1].key, 'http.status_code');
  assert.strictEqual(serverSpan.attributes[1].value.intValue, '200');
  assert.strictEqual(serverSpan.attributes[2].key, 'http.status_text');
  assert.strictEqual(serverSpan.attributes[2].value.stringValue, 'OK');
  assert.strictEqual(serverSpan.attributes[3].key, 'http.url');
  assert.strictEqual(serverSpan.attributes[3].value.stringValue,
                     `http://127.0.0.1:${port}/`);
  assert.strictEqual(serverSpan.attributes[4].key, 'thread.id');
  assert.strictEqual(serverSpan.attributes[4].value.intValue, `${threadId}`);

  const clientSpan = spans[1];
  validateString(clientSpan.traceId, 'clientSpan.traceId');
  validateString(clientSpan.spanId, 'clientSpan.spanId');
  assert.strictEqual(clientSpan.name, 'HTTP GET');
  assert.strictEqual(clientSpan.kind, 'SPAN_KIND_CLIENT');
  const startTimeUnixNano2 = BigInt(clientSpan.startTimeUnixNano);
  assert.ok(startTimeUnixNano2);
  const endTimeUnixNano2 = BigInt(clientSpan.endTimeUnixNano);
  assert.ok(endTimeUnixNano2);
  validateArray(clientSpan.attributes, 'clientSpan.attributes');
  assert.strictEqual(clientSpan.attributes.length, 5);
  assert.strictEqual(clientSpan.attributes[0].key, 'http.method');
  assert.strictEqual(clientSpan.attributes[0].value.stringValue, 'GET');
  assert.strictEqual(clientSpan.attributes[1].key, 'http.status_code');
  assert.strictEqual(clientSpan.attributes[1].value.intValue, '200');
  assert.strictEqual(clientSpan.attributes[2].key, 'http.status_text');
  assert.strictEqual(clientSpan.attributes[2].value.stringValue, 'OK');
  assert.strictEqual(clientSpan.attributes[3].key, 'http.url');
  assert.strictEqual(clientSpan.attributes[3].value.stringValue,
                     `http://127.0.0.1:${port}/`);
  assert.strictEqual(clientSpan.attributes[4].key, 'thread.id');
  assert.strictEqual(clientSpan.attributes[4].value.intValue, `${threadId}`);
}

let workerPort;
let workerThreadId;
const otlpServer = new OTLPServer();
otlpServer.start(mustSucceed(async (port) => {
  console.log('OTLP server started', port);
  nsolid.start({
    otlp: 'otlp',
    otlpConfig: {
      url: `http://localhost:${port}`,
    },
    pauseMetrics: true,
    tracingEnabled: true,
  });

  await execHttpTransaction();
  const worker = new Worker(__filename);
  workerThreadId = worker.threadId;
  worker.once('message', mustCall((message) => {
    assert.strictEqual(message.type, 'port');
    workerPort = message.port;
    if (resourceSpans.length === 1 &&
        resourceSpans[0].scopeSpans.length === 4) {
      const resourceSpan = resourceSpans[0];
      const scopeSpans = resourceSpan.scopeSpans;
      const workerSpans = scopeSpans.splice(2, 2);
      checkResource(resourceSpan.resource);
      checkSpans(scopeSpans, threadId, httpPort);
      checkSpans(workerSpans, workerThreadId, workerPort);
      otlpServer.close();
    }
  }));
}));

function mergeResourceSpans(data, result) {
  for (const resourceSpan of data.resourceSpans) {
    const existingResourceSpan =
      result.find((rs) => JSON.stringify(rs.resource) === JSON.stringify(resourceSpan.resource));

    if (existingResourceSpan) {
      existingResourceSpan.scopeSpans.push(...resourceSpan.scopeSpans);
    } else {
      result.push({ ...resourceSpan });
    }
  }

  // // Merge scopeSpans with same scope
  for (const resourceSpan of result) {
    const scopeSpans = resourceSpan.scopeSpans;
    const mergedScopeSpans = [];
    for (const scopeSpan of scopeSpans) {
      const existingScopeSpan =
        mergedScopeSpans.find((ss) => JSON.stringify(ss.scope) === JSON.stringify(scopeSpan.scope));
      if (existingScopeSpan) {
        existingScopeSpan.spans.push(...scopeSpan.spans);
      } else {
        mergedScopeSpans.push({ ...scopeSpan });
      }
    }
    resourceSpan.scopeSpans = mergedScopeSpans;
  }
}

const resourceSpans = [];

otlpServer.on('spans', mustCallAtLeast((spans) => {
  mergeResourceSpans(spans, resourceSpans);
  if (workerPort &&
      resourceSpans.length === 1 &&
      resourceSpans[0].scopeSpans.length === 1 &&
      resourceSpans[0].scopeSpans[0].spans.length === 4) {
    console.dir(resourceSpans, { depth: null });
    const resourceSpan = resourceSpans[0];
    const scopeSpans = resourceSpan.scopeSpans[0].spans;
    const workerSpans = scopeSpans.splice(2, 2);
    checkResource(resourceSpan.resource);
    checkSpans(scopeSpans, threadId, httpPort);
    checkSpans(workerSpans, workerThreadId, workerPort);
    otlpServer.close();
  }
}, 1));
