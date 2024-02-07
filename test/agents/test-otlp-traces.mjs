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

// Check the spans received from agent
// This is an example:
// {
//   resourceSpans: [
//     {
//       resource: {
//         attributes: [
//           {
//             key: 'telemetry.sdk.version',
//             value: { stringValue: '1.11.0' }
//           },
//           {
//             key: 'telemetry.sdk.name',
//             value: { stringValue: 'opentelemetry' }
//           },
//           {
//             key: 'telemetry.sdk.language',
//             value: { stringValue: 'cpp' }
//           },
//           { key: 'service.version', value: { stringValue: '1.0.0' } },
//           {
//             key: 'service.name',
//             value: { stringValue: 'untitled application' }
//           }
//         ]
//       },
//       scopeSpans: [
//         {
//           scope: {},
//           spans: [
//             {
//               traceId: '8KB506IZekRfeYpnrUmiUQ==',
//               spanId: '/hI2cVd8pGY=',
//               parentSpanId: 'tnBxyglogRE=',
//               name: 'HTTP GET',
//               kind: 'SPAN_KIND_SERVER',
//               startTimeUnixNano: '1707327711744000000',
//               endTimeUnixNano: '1707327711745920410',
//               attributes: [
//                 { key: 'http.method', value: { stringValue: 'GET' } },
//                 { key: 'http.status_code', value: { intValue: '200' } },
//                 {
//                   key: 'http.status_text',
//                   value: { stringValue: 'OK' }
//                 },
//                 {
//                   key: 'http.url',
//                   value: { stringValue: 'http://127.0.0.1:44299/' }
//                 },
//                 { key: 'thread.id', value: { intValue: '0' } }
//               ]
//             }
//           ]
//         }
//       ]
//     },
//     {
//       resource: {
//         attributes: [
//           {
//             key: 'telemetry.sdk.version',
//             value: { stringValue: '1.11.0' }
//           },
//           {
//             key: 'telemetry.sdk.name',
//             value: { stringValue: 'opentelemetry' }
//           },
//           {
//             key: 'telemetry.sdk.language',
//             value: { stringValue: 'cpp' }
//           },
//           { key: 'service.version', value: { stringValue: '1.0.0' } },
//           {
//             key: 'service.name',
//             value: { stringValue: 'untitled application' }
//           }
//         ]
//       },
//       scopeSpans: [
//         {
//           scope: {},
//           spans: [
//             {
//               traceId: '8KB506IZekRfeYpnrUmiUQ==',
//               spanId: 'tnBxyglogRE=',
//               name: 'HTTP GET',
//               kind: 'SPAN_KIND_CLIENT',
//               startTimeUnixNano: '1707327711737000000',
//               endTimeUnixNano: '1707327711747702392',
//               attributes: [
//                 { key: 'http.method', value: { stringValue: 'GET' } },
//                 { key: 'http.status_code', value: { intValue: '200' } },
//                 {
//                   key: 'http.status_text',
//                   value: { stringValue: 'OK' }
//                 },
//                 {
//                   key: 'http.url',
//                   value: { stringValue: 'http://127.0.0.1:44299/' }
//                 },
//                 { key: 'thread.id', value: { intValue: '0' } }
//               ]
//             }
//           ]
//         }
//       ]
//     }
//   ]
// }

function checkSpans(spans, threadId, port) {
  // console.dir(spans, { depth: null });
  assert.ok(spans);
  validateArray(spans.resourceSpans, 'spans.resourceSpans');
  assert.strictEqual(spans.resourceSpans.length, 2);
  const serverResourceSpan = spans.resourceSpans[0];
  assert.ok(serverResourceSpan.resource);
  validateArray(serverResourceSpan.resource.attributes, 'serverResourceSpan.resource.attributes');
  assert.strictEqual(serverResourceSpan.resource.attributes.length, 5);
  validateArray(serverResourceSpan.scopeSpans, 'serverResourceSpan.scopeSpans');
  assert.strictEqual(serverResourceSpan.scopeSpans.length, 1);
  const serverScopeSpan = serverResourceSpan.scopeSpans[0];
  assert.ok(serverScopeSpan.scope);
  validateArray(serverScopeSpan.spans, 'serverScopeSpan.spans');
  assert.strictEqual(serverScopeSpan.spans.length, 1);
  let span = serverScopeSpan.spans[0];
  validateString(span.traceId, 'span.traceId');
  validateString(span.spanId, 'span.spanId');
  validateString(span.parentSpanId, 'span.parentSpanId');
  assert.strictEqual(span.name, 'HTTP GET');
  assert.strictEqual(span.kind, 'SPAN_KIND_SERVER');
  const startTimeUnixNano = BigInt(span.startTimeUnixNano);
  assert.ok(startTimeUnixNano);
  const endTimeUnixNano = BigInt(span.endTimeUnixNano);
  assert.ok(endTimeUnixNano);
  validateArray(span.attributes, 'span.attributes');
  assert.strictEqual(span.attributes.length, 5);
  assert.strictEqual(span.attributes[0].key, 'http.method');
  assert.strictEqual(span.attributes[0].value.stringValue, 'GET');
  assert.strictEqual(span.attributes[1].key, 'http.status_code');
  assert.strictEqual(span.attributes[1].value.intValue, '200');
  assert.strictEqual(span.attributes[2].key, 'http.status_text');
  assert.strictEqual(span.attributes[2].value.stringValue, 'OK');
  assert.strictEqual(span.attributes[3].key, 'http.url');
  assert.strictEqual(span.attributes[3].value.stringValue,
                     `http://127.0.0.1:${port}/`);
  assert.strictEqual(span.attributes[4].key, 'thread.id');
  assert.strictEqual(span.attributes[4].value.intValue, `${threadId}`);

  const clientResourceSpan = spans.resourceSpans[1];
  assert.ok(clientResourceSpan.resource);
  validateArray(clientResourceSpan.resource.attributes, 'clientResourceSpan.resource.attributes');
  assert.strictEqual(clientResourceSpan.resource.attributes.length, 5);
  validateArray(clientResourceSpan.scopeSpans, 'clientResourceSpan.scopeSpans');
  assert.strictEqual(clientResourceSpan.scopeSpans.length, 1);
  const clientScopeSpan = clientResourceSpan.scopeSpans[0];
  assert.ok(clientScopeSpan.scope);
  validateArray(clientScopeSpan.spans, 'clientScopeSpan.spans');
  assert.strictEqual(clientScopeSpan.spans.length, 1);
  span = clientScopeSpan.spans[0];
  validateString(span.traceId, 'span.traceId');
  validateString(span.spanId, 'span.spanId');
  assert.strictEqual(span.name, 'HTTP GET');
  assert.strictEqual(span.kind, 'SPAN_KIND_CLIENT');
  const startTimeUnixNano2 = BigInt(span.startTimeUnixNano);
  assert.ok(startTimeUnixNano2);
  const endTimeUnixNano2 = BigInt(span.endTimeUnixNano);
  assert.ok(endTimeUnixNano2);
  validateArray(span.attributes, 'span.attributes');
  assert.strictEqual(span.attributes.length, 5);
  assert.strictEqual(span.attributes[0].key, 'http.method');
  assert.strictEqual(span.attributes[0].value.stringValue, 'GET');
  assert.strictEqual(span.attributes[1].key, 'http.status_code');
  assert.strictEqual(span.attributes[1].value.intValue, '200');
  assert.strictEqual(span.attributes[2].key, 'http.status_text');
  assert.strictEqual(span.attributes[2].value.stringValue, 'OK');
  assert.strictEqual(span.attributes[3].key, 'http.url');
  assert.strictEqual(span.attributes[3].value.stringValue,
                     `http://127.0.0.1:${port}/`);
  assert.strictEqual(span.attributes[4].key, 'thread.id');
  assert.strictEqual(span.attributes[4].value.intValue, `${threadId}`);
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
    tracingEnabled: true,
  });

  await execHttpTransaction();
  const worker = new Worker(__filename);
  workerThreadId = worker.threadId;
  worker.once('message', mustCall((message) => {
    assert.strictEqual(message.type, 'port');
    workerPort = message.port;
    if (spans.resourceSpans.length === 4) {
      console.dir(spans, { depth: null });
      const workerSpans = spans.splice(2, 2);
      checkSpans(spans, threadId, httpPort);
      checkSpans(workerSpans, workerThreadId, workerPort);
      otlpServer.close();
    }
  }));
}));

const spans = { resourceSpans: [] };
otlpServer.on('spans', mustCallAtLeast((_spans) => {
  spans.resourceSpans = [...spans.resourceSpans, ..._spans.resourceSpans ];
  if (workerPort && spans.resourceSpans.length === 4) {
    console.dir(spans, { depth: null });
    const resourceSpans = spans.resourceSpans;
    const workerSpans = { resourceSpans: resourceSpans.splice(2, 2) };
    checkSpans(spans, threadId, httpPort);
    checkSpans(workerSpans, workerThreadId, workerPort);
    otlpServer.close();
  }
}, 1));
