// Flags: --expose-internals
import { mustCall, mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { threadId } from 'node:worker_threads';
import { setTimeout as delay } from 'node:timers/promises';
import {
  checkExitData,
  checkResource,
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';
import validators from 'internal/validators';

const {
  validateArray,
} = validators;

// traceId: {
//   type: 'Buffer',
//   data: [
//     114, 166, 149,  74, 233,
//     128, 194, 112, 143, 186,
//     157,  28,  56, 206, 132,
//      25
//   ]
// }
function validateId(id, length) {
  assert.ok(id);
  assert.strictEqual(id.type, 'Buffer');
  assert.ok(Array.isArray(id.data));
  assert.strictEqual(id.data.length, length);
}

const expectedHttpAttributes = (threadId, spanType) => {
  // Attributes that are always present. Format:
  // [type, value, startsWith (only for strings)]
  return {
    'http.method': [ 'stringValue', 'GET', false ],
    'network.protocol.version': [ 'stringValue', '1.1', false ],
    'http.url': [ 'stringValue', 'http://127.0.0.1:', true ],
    'http.status_code': [ 'intValue', '200', false ],
    'http.status_text': [ 'stringValue', 'OK', false ],
    'thread.id': [ 'intValue', `${threadId}`, false ],
    'nsolid.span_type': [ 'intValue', `${spanType}`, false ],
  };
};

const expectedCustomAttributes = (threadId) => {
  // Attributes that are always present. Format:
  // [type, value, startsWith (only for strings)]
  return {
    'a': [ 'intValue', '1', false ],
    'b': [ 'intValue', '2', false ],
    'c': [ 'intValue', '3', false ],
    'd': [ 'intValue', '4', false ],
    'latin1': [ 'stringValue', 'Espa\u00f1a', false ],
    'e': [ 'arrayValue', [
      { stringValue: 'abAD', value: 'stringValue' },
      { stringValue: 'cdCF', value: 'stringValue' },
    ], false ],
    'thread.id': [ 'intValue', `${threadId}`, false ],
    'nsolid.span_type': [ 'intValue', '16', false ],
  };
};

function checkAttributes(attributes, expectedAttributes) {
  validateArray(attributes, 'attributes');
  assert.strictEqual(attributes.length, Object.keys(expectedAttributes).length);
  for (const [key, value] of Object.entries(expectedAttributes)) {
    const attr = attributes.find((a) => a.key === key);
    assert.ok(attr);
    assert.strictEqual(attr.value.value, value[0]);
    if (value[0] === 'stringValue') {
      if (value[2]) {
        assert.ok(attr.value.stringValue.startsWith(value[1]));
      } else {
        assert.strictEqual(attr.value.stringValue, value[1]);
      }
    } else if (value[0] === 'intValue') {
      assert.strictEqual(attr.value.intValue, value[1]);
    } else if (value[0] === 'arrayValue') {
      // Handle array values
      assert.ok(attr.value.arrayValue);
      assert.ok(attr.value.arrayValue.values);
      const expectedArray = value[1];
      const actualArray = attr.value.arrayValue.values;
      assert.strictEqual(actualArray.length, expectedArray.length);

      // Check each element in the array
      for (let i = 0; i < expectedArray.length; i++) {
        const expectedElement = expectedArray[i];
        const actualElement = actualArray[i];
        assert.strictEqual(actualElement.value, expectedElement.value);
        if (expectedElement.value === 'stringValue') {
          assert.strictEqual(actualElement.stringValue, expectedElement.stringValue);
        } else if (expectedElement.value === 'intValue') {
          assert.strictEqual(actualElement.intValue, expectedElement.intValue);
        }
      }
    }
  }
}

function checkHttpSpans(spans, threadId) {
  console.dir(spans, { depth: null });
  assert.ok(spans);
  validateArray(spans, 'spans');
  assert.strictEqual(spans.length, 2);

  const serverSpan = spans[0];
  validateId(serverSpan.traceId, 16);
  validateId(serverSpan.spanId, 8);
  validateId(serverSpan.parentSpanId, 8);
  assert.strictEqual(serverSpan.name, 'HTTP GET');
  assert.strictEqual(serverSpan.kind, 'SPAN_KIND_SERVER');
  const startTimeUnixNano = BigInt(serverSpan.startTimeUnixNano);
  assert.ok(startTimeUnixNano);
  const endTimeUnixNano = BigInt(serverSpan.endTimeUnixNano);
  assert.ok(endTimeUnixNano);
  checkAttributes(serverSpan.attributes, expectedHttpAttributes(threadId, 8));

  const clientSpan = spans[1];
  validateId(serverSpan.traceId, 16);
  validateId(serverSpan.spanId, 8);
  assert.strictEqual(clientSpan.name, 'HTTP GET');
  assert.strictEqual(clientSpan.kind, 'SPAN_KIND_CLIENT');
  const startTimeUnixNano2 = BigInt(clientSpan.startTimeUnixNano);
  assert.ok(startTimeUnixNano2);
  const endTimeUnixNano2 = BigInt(clientSpan.endTimeUnixNano);
  assert.ok(endTimeUnixNano2);
  checkAttributes(clientSpan.attributes, expectedHttpAttributes(threadId, 4));
}

function checkCustomSpans(spans, threadId) {
  console.dir(spans, { depth: null });
  assert.ok(spans);
  validateArray(spans, 'spans');
  assert.strictEqual(spans.length, 1);

  const span = spans[0];
  validateId(span.traceId, 16);
  validateId(span.spanId, 8);
  assert.strictEqual(span.name, 'initial_name');
  assert.strictEqual(span.kind, 'SPAN_KIND_CLIENT');
  const startTimeUnixNano = BigInt(span.startTimeUnixNano);
  assert.ok(startTimeUnixNano);
  const endTimeUnixNano = BigInt(span.endTimeUnixNano);
  assert.ok(endTimeUnixNano);
  checkAttributes(span.attributes, expectedCustomAttributes(threadId));
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

const tests = [];
tests.push({
  name: 'should work for http tracing',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId, { code: 0, error: null, profile: '' });
          grpcServer.close();
          resolve();
        }));

        const env = getEnv(port);
        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient(['-t', 'http'], opts);
        const agentId = await child.id();
        const config = await child.config();
        const resourceSpans = [];
        let phase = 'initial';
        grpcServer.on('spans', mustCallAtLeast(async (spans) => {
          if (phase === 'done')
            return;

          mergeResourceSpans(spans, resourceSpans);

          if (phase === 'initial' &&
              resourceSpans.length === 1 &&
              resourceSpans[0].scopeSpans.length === 1 &&
              resourceSpans[0].scopeSpans[0].spans.length === 2) {
            console.dir(resourceSpans, { depth: null });
            const resourceSpan = resourceSpans[0];
            const scopeSpans = resourceSpan.scopeSpans[0].spans;
            checkResource(resourceSpan.resource, agentId, config);
            checkHttpSpans(scopeSpans, threadId, 0);

            resourceSpans.length = 0;
            phase = 'disabled';

            await child.disableTraces();
            await child.trace('http');
            await delay(200);
            assert.strictEqual(resourceSpans.length, 0);

            phase = 'reenabled';
            await child.enableTraces();
            await child.trace('http');
          } else if (phase === 'reenabled' &&
                     resourceSpans.length === 1 &&
                     resourceSpans[0].scopeSpans.length === 1 &&
                     resourceSpans[0].scopeSpans[0].spans.length === 2) {
            console.dir(resourceSpans, { depth: null });
            const resourceSpan = resourceSpans[0];
            const scopeSpans = resourceSpan.scopeSpans[0].spans;
            checkResource(resourceSpan.resource, agentId, config);
            checkHttpSpans(scopeSpans, threadId, 0);

            phase = 'done';
            await child.shutdown(0);
            resolve();
          }
        }, 2));
      }));
    });
  },
});

tests.push({
  name: 'should work for custom tracing',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        grpcServer.on('exit', mustCall((data) => {
          checkExitData(data.msg, data.metadata, agentId, { code: 0, error: null, profile: '' });
          grpcServer.close();
          resolve();
        }));

        const env = getEnv(port);
        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient(['-t', 'custom'], opts);
        const agentId = await child.id();
        const config = await child.config();
        const resourceSpans = [];
        let phase = 'initial';
        grpcServer.on('spans', mustCallAtLeast(async (spans) => {
          if (phase === 'done')
            return;

          mergeResourceSpans(spans, resourceSpans);

          if (phase === 'initial' &&
              resourceSpans.length === 1 &&
              resourceSpans[0].scopeSpans.length === 1 &&
              resourceSpans[0].scopeSpans[0].spans.length === 1) {
            console.dir(resourceSpans, { depth: null });
            const resourceSpan = resourceSpans[0];
            const scopeSpans = resourceSpan.scopeSpans[0].spans;
            checkResource(resourceSpan.resource, agentId, config);
            checkCustomSpans(scopeSpans, threadId, 0);

            resourceSpans.length = 0;
            phase = 'disabled';

            await child.disableTraces();
            await child.trace('custom');
            await delay(200);
            assert.strictEqual(resourceSpans.length, 0);

            phase = 'reenabled';
            await child.enableTraces();
            await child.trace('custom');
          } else if (phase === 'reenabled' &&
                     resourceSpans.length === 1 &&
                     resourceSpans[0].scopeSpans.length === 1 &&
                     resourceSpans[0].scopeSpans[0].spans.length === 1) {
            console.dir(resourceSpans, { depth: null });
            const resourceSpan = resourceSpans[0];
            const scopeSpans = resourceSpan.scopeSpans[0].spans;
            checkResource(resourceSpan.resource, agentId, config);
            checkCustomSpans(scopeSpans, threadId, 0);

            phase = 'done';
            await child.shutdown(0);
            resolve();
          }
        }, 2));
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
        NSOLID_TRACING_ENABLED: 1,
        NSOLID_INTERVAL: 100000,
      };
    },
  },
  {
    getEnv: (port) => {
      return {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_SAAS: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbtesting.localhost:${port}`,
        NSOLID_TRACING_ENABLED: 1,
        NSOLID_INTERVAL: 100000,
      };
    },
  },
];

for (const testConfig of testConfigs) {
  for (const { name, test } of tests) {
    console.log(`[tracing] ${name}`);
    await test(testConfig.getEnv);
  }
}
