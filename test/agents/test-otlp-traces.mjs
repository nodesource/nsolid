// Flags: --expose-internals
import { mustCall, mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'url';
import { isMainThread, parentPort, threadId, Worker } from 'node:worker_threads';
import nsolid from 'nsolid';
import validators from 'internal/validators';

import {
  OTLPServer,
} from '../common/nsolid-otlp-agent/index.js';

const __filename = fileURLToPath(import.meta.url);

if (process.argv[2] === 'child') {

  async function execHttpTransaction() {
    const server = http.createServer(mustCall((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Hello World\n');
    }));

    return new Promise((resolve, reject) => {
      server.listen(0, () => {
        const httpPort = server.address().port;
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
            resolve(httpPort);
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
    const httpPort = await execHttpTransaction();
    parentPort.postMessage({ type: 'port', port: httpPort });
    process.exit(0);
  }

  nsolid.start({
    pauseMetrics: true,
  });

  const httpPort = await execHttpTransaction();
  process.send({ type: 'port', port: httpPort });
  const worker = new Worker(__filename, { argv: ['child'] });
  process.send({ type: 'workerThreadId', id: worker.threadId });
  worker.once('message', mustCall((message) => {
    assert.strictEqual(message.type, 'port');
    process.send({ type: 'workerPort', port: message.port });
  }));
  const interval = setInterval(() => {
    console.log('interval');
  }, 100);
  process.on('message', (message) => {
    assert.strictEqual(message, 'exit');
    clearInterval(interval);
    process.exit(0);
  });
} else {
  const {
    validateArray,
    validateString,
  } = validators;

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
    assert.strictEqual(serverSpan.attributes.length, 6);
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
    assert.strictEqual(serverSpan.attributes[5].key, 'nsolid.span_type');
    assert.strictEqual(serverSpan.attributes[5].value.intValue, '8');

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
    assert.strictEqual(clientSpan.attributes.length, 6);
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
    assert.strictEqual(clientSpan.attributes[5].key, 'nsolid.span_type');
    assert.strictEqual(clientSpan.attributes[5].value.intValue, '4');
  }

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

  async function runTest(getEnv) {
    return new Promise((resolve, reject) => {
      const otlpServer = new OTLPServer();
      otlpServer.start(mustSucceed(async (port) => {
        let httpPort;
        let workerPort;
        let workerThreadId;
        const resourceSpans = [];
        otlpServer.on('spans', mustCallAtLeast((spans) => {
          mergeResourceSpans(spans, resourceSpans);
          if (workerPort &&
              resourceSpans.length === 1 &&
              resourceSpans[0].scopeSpans.length === 1 &&
              resourceSpans[0].scopeSpans[0].spans.length === 4) {
            child.send('exit');
          }
        }, 1));

        console.log('OTLP server started', port);
        const env = getEnv(port);

        const opts = { env };
        const child = fork(__filename, ['child'], opts);
        child.on('message', (message) => {
          if (message.type === 'port') {
            httpPort = message.port;
          } else if (message.type === 'workerPort') {
            workerPort = message.port;
            if (resourceSpans.length === 1 &&
                resourceSpans[0].scopeSpans.length === 4) {
              child.send('exit');
            }
          } else if (message.type === 'workerThreadId') {
            workerThreadId = message.id;
          }
        });

        child.on('exit', (code, signal) => {
          console.log(`child process exited with code ${code} and signal ${signal}`);
          console.dir(resourceSpans, { depth: null });
          const resourceSpan = resourceSpans[0];
          const scopeSpans = resourceSpan.scopeSpans[0].spans;
          const workerSpans = scopeSpans.splice(2, 2);
          checkResource(resourceSpan.resource);
          checkSpans(scopeSpans, threadId, httpPort);
          checkSpans(workerSpans, workerThreadId, workerPort);
          otlpServer.close();
          resolve();
        });
      }));
    });
  }

  const getEnvs = [
    (port) => {
      return {
        NSOLID_TRACING_ENABLED: 1,
        NSOLID_OTLP: 'otlp',
        NSOLID_OTLP_CONFIG: JSON.stringify({
          url: `http://localhost:${port}`,
          protocol: 'http',
        }),
      };
    },
    (port) => {
      return {
        NSOLID_TRACING_ENABLED: 1,
        NSOLID_OTLP: 'otlp',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://localhost:${port}`,
      };
    },
    (port) => {
      return {
        NSOLID_TRACING_ENABLED: 1,
        NSOLID_OTLP: 'otlp',
        OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: 'http/protobuf',
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `http://localhost:${port}/v1/traces`,
      };
    },
  ];

  for (const getEnv of getEnvs) {
    await runTest(getEnv);
    console.log('run test!');
  }
}
