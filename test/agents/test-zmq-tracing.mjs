// Flags: --expose-internals
import { mustCall, mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { threadId } from 'node:worker_threads';
import { setTimeout as delay } from 'node:timers/promises';
import validators from 'internal/validators';
import { TestPlayground } from '../common/nsolid-zmq-agent/index.js';

const {
  validateArray,
  validateInteger,
  validateNumber,
  validateObject,
  validateString,
  validateUint32,
} = validators;

// Data has this format:
// {
//   agentId: '17ef14fe5ca50000ec1ae6ac86506e0035ff3712',
//   requestId: null,
//   command: 'tracing',
//   recorded: { seconds: 1704988827, nanoseconds: 304585184 },
//   duration: 0,
//   interval: 3000,
//   version: 4,
//   body: {
//     spans: [
//       {
//         id: '35ebb6078569c26c',
//         parentId: '15ec3a1a54d7d1e9',
//         traceId: '296826148ce0ab83cd036b8f33f26784',
//         start: 1704988827220.339,
//         end: 1704988827222.5215,
//         kind: 1,
//         type: 8,
//         name: 'HTTP GET',
//         threadId: 0,
//         status: { message: '', code: 0 },
//         attributes: {
//           'http.method': 'GET',
//           'http.status_code': 200,
//           'http.status_text': 'OK',
//           'http.url': 'http://127.0.0.1:42347/'
//         },
//         events: []
//       },
//       {
//         id: '15ec3a1a54d7d1e9',
//         parentId: '0000000000000000',
//         traceId: '296826148ce0ab83cd036b8f33f26784',
//         start: 1704988827213.4678,
//         end: 1704988827224.286,
//         kind: 2,
//         type: 4,
//         name: 'HTTP GET',
//         threadId: 0,
//         status: { message: '', code: 0 },
//         attributes: {
//           'http.method': 'GET',
//           'http.status_code': 200,
//           'http.status_text': 'OK',
//           'http.url': 'http://127.0.0.1:42347/'
//         },
//         events: []
//       }
//     ]
//   },
//   time: 1704988827305,
//   timeNS: '1704988827304585184'
// }

function checkTracingData(tracing, requestId, agentId, threadId, appName) {
  console.dir(tracing, { depth: null });
  assert.strictEqual(tracing.requestId, requestId);
  assert.strictEqual(tracing.agentId, agentId);
  assert.strictEqual(tracing.app, appName);
  assert.strictEqual(tracing.command, 'tracing');
  // From here check at least that all the fields are present
  validateObject(tracing.recorded, 'recorded');
  validateUint32(tracing.recorded.seconds, 'recorded.seconds');
  validateUint32(tracing.recorded.nanoseconds, 'recorded.nanoseconds');
  validateUint32(tracing.duration, 'duration');
  validateUint32(tracing.interval, 'interval');
  assert.strictEqual(tracing.version, 4);
  validateObject(tracing.body, 'body');
  validateInteger(tracing.time, 'time');
  validateArray(tracing.body.spans, 'body.spans');
}

function validateSpan(span, spanType, threadId) {
  validateString(span.id, 'span.id');
  validateString(span.parentId, 'span.parentId');
  validateString(span.traceId, 'span.traceId');
  validateNumber(span.start, 'span.start');
  validateNumber(span.end, 'span.end');
  assert.strictEqual(span.threadId, threadId);
  validateObject(span.status, 'span.status');
  validateObject(span.attributes, 'span.attributes');
  validateArray(span.events, 'span.events');
  switch (spanType) {
    case 'http_server':
      assert.strictEqual(span.kind, 1);
      assert.strictEqual(span.type, 8);
      assert.strictEqual(span.name, 'HTTP GET');
      assert.strictEqual(span.attributes['http.method'], 'GET');
      assert.strictEqual(span.attributes['http.status_code'], 200);
      assert.strictEqual(span.attributes['http.status_text'], 'OK');
      assert.ok(span.attributes['http.url'].startsWith('http://127.0.0.1:'));
      break;
    case 'http_client':
      assert.strictEqual(span.kind, 2);
      assert.strictEqual(span.type, 4);
      assert.strictEqual(span.name, 'HTTP GET');
      assert.strictEqual(span.attributes['http.method'], 'GET');
      assert.strictEqual(span.attributes['http.status_code'], 200);
      assert.strictEqual(span.attributes['http.status_text'], 'OK');
      assert.ok(span.attributes['http.url'].startsWith('http://127.0.0.1:'));
      break;
    case 'dns_lookup':
      assert.strictEqual(span.kind, 2);
      assert.strictEqual(span.type, 1);
      assert.strictEqual(span.name, 'DNS lookup');
      validateString(span.attributes['dns.address'], 'span.attributes.dns.address');
      assert.strictEqual(span.attributes['dns.hostname'], 'example.org');
      assert.strictEqual(span.attributes['dns.op_type'], 0);
      break;
    case 'dns_lookup_service':
      assert.strictEqual(span.kind, 2);
      assert.strictEqual(span.type, 1);
      assert.strictEqual(span.name, 'DNS lookup_service');
      assert.strictEqual(span.attributes['dns.address'], '127.0.0.1');
      validateString(span.attributes['dns.hostname'], 'span.attributes.dns.hostname');
      assert.strictEqual(span.attributes['dns.op_type'], 1);
      assert.strictEqual(span.attributes['dns.port'], 22);
      break;
    case 'dns_resolve':
      assert.strictEqual(span.kind, 2);
      assert.strictEqual(span.type, 1);
      assert.strictEqual(span.name, 'DNS resolve');
      validateArray(span.attributes['dns.address'], 'span.attributes.dns.address');
      assert.strictEqual(span.attributes['dns.hostname'], 'example.org');
      assert.strictEqual(span.attributes['dns.op_type'], 2);
      break;
    case 'custom':
      assert.strictEqual(span.kind, 2);
      assert.strictEqual(span.type, 16);
      assert.strictEqual(span.name, 'initial_name');
      assert.strictEqual(span.attributes.a, 1);
      assert.strictEqual(span.attributes.b, 2);
      assert.strictEqual(span.attributes.c, 3);
      assert.strictEqual(span.attributes.d, 4);
      assert.strictEqual(span.attributes.e, 5);
      assert.strictEqual(span.events.length, 3);
      assert.strictEqual(span.events[0].name, 'my_event 1');
      assert.strictEqual(span.events[1].name, 'my_event 2');
      assert.strictEqual(span.events[1].attributes.attr1, 'val1');
      assert.strictEqual(span.events[1].attributes.attr2, 'val2');
      assert.strictEqual(span.events[2].name, 'exception');
      assert.strictEqual(span.events[2].attributes['exception.type'], 'Error');
      assert.strictEqual(span.events[2].attributes['exception.message'], 'my_exception');
      assert.ok(span.events[2].attributes['exception.stacktrace'].startsWith('Error: my_exception'));
      break;
  }

  validateUint32(span.threadId, 'span.threadId');
  validateObject(span.status, 'span.status');
  validateObject(span.attributes, 'span.attributes');
  validateArray(span.events, 'span.events');
}

const tests = [];

function testHttpTransactions(playground) {
  return new Promise((resolve) => {
    let totalSpans = 0;
    const opts = {
      opts: {
        env: {
          NSOLID_TRACING_ENABLED: 1,
          NSOLID_APPNAME: 'myapp',
        },
      },
    };

    playground.bootstrap(opts, mustSucceed(async (agentId) => {
      await playground.client.tracing('http', threadId);
    }), mustCallAtLeast((eventType, agentId, data) => {
      console.log(`${eventType}, ${agentId}`);
      assert.strictEqual(eventType, 'agent-tracing');
      checkTracingData(data, null, agentId, threadId, 'myapp');
      const spanTypes = [ 'http_server', 'http_client'];
      for (const span of data.body.spans) {
        validateSpan(span, spanTypes[totalSpans], threadId);
        totalSpans++;
      }
      if (totalSpans === 2) {
        resolve();
      }
    }, 1));
  });
}

function testHttpTransactionsOnStartup(playground) {
  return new Promise((resolve) => {
    let totalSpans = 0;
    const opts = {
      args: [ '-t', 'http' ],
      opts: {
        env: {
          NSOLID_TRACING_ENABLED: 1,
          NSOLID_APPNAME: 'myapp',
        },
      },
    };

    playground.bootstrap(opts, mustSucceed(() => {
    }), mustCallAtLeast((eventType, agentId, data) => {
      console.log(`${eventType}, ${agentId}`);
      assert.strictEqual(eventType, 'agent-tracing');
      checkTracingData(data, null, agentId, threadId, 'myapp');
      const spanTypes = [ 'http_server', 'http_client'];
      for (const span of data.body.spans) {
        validateSpan(span, spanTypes[totalSpans], threadId);
        totalSpans++;
      }
      if (totalSpans === 2) {
        resolve();
      }
    }, 1));
  });
}

function testHttpTransactionsOnWorker(playground) {
  return new Promise((resolve) => {
    let wid;
    let totalSpans = 0;
    const opts = {
      args: [ '-w', 1 ],
      opts: {
        env: {
          NSOLID_TRACING_ENABLED: 1,
          NSOLID_APPNAME: 'myapp',
        },
      },
    };

    playground.bootstrap(opts, mustSucceed(async (agentId) => {
      const workers = await playground.client.workers();
      wid = workers[0];
      await playground.client.tracing('http', wid);
    }), mustCallAtLeast((eventType, agentId, data) => {
      console.log(`${eventType}, ${agentId}`);
      assert.strictEqual(eventType, 'agent-tracing');
      checkTracingData(data, null, agentId, wid, 'myapp');
      const spanTypes = [ 'http_server', 'http_client'];
      for (const span of data.body.spans) {
        validateSpan(span, spanTypes[totalSpans], wid);
        totalSpans++;
      }
      if (totalSpans === 2) {
        resolve();
      }
    }, 1));
  });
}

function testDnsTransactions(playground) {
  return new Promise((resolve) => {
    let totalSpans = 0;
    const opts = {
      opts: {
        env: {
          NSOLID_TRACING_ENABLED: 1,
          NSOLID_APPNAME: 'myapp',
        },
      },
    };

    playground.bootstrap(opts, mustSucceed(async (agentId) => {
      await playground.client.tracing('dns', threadId);
    }), mustCallAtLeast((eventType, agentId, data) => {
      console.log(`${eventType}, ${agentId}`);
      assert.strictEqual(eventType, 'agent-tracing');
      checkTracingData(data, null, agentId, threadId, 'myapp');
      const spanTypes = [ 'dns_lookup', 'dns_lookup_service', 'dns_resolve'];
      for (const span of data.body.spans) {
        validateSpan(span, spanTypes[totalSpans], threadId);
        totalSpans++;
      }
      if (totalSpans === 3) {
        resolve();
      }
    }, 1));
  });
}

function testDnsTransactionsOnWorker(playground) {
  return new Promise((resolve) => {
    let wid;
    let totalSpans = 0;
    const opts = {
      args: [ '-w', 1 ],
      opts: {
        env: {
          NSOLID_TRACING_ENABLED: 1,
          NSOLID_APPNAME: 'myapp',
        },
      },
    };

    playground.bootstrap(opts, mustSucceed(async (agentId) => {
      const workers = await playground.client.workers();
      wid = workers[0];
      await playground.client.tracing('dns', wid);
    }), mustCallAtLeast((eventType, agentId, data) => {
      console.log(`${eventType}, ${agentId}`);
      assert.strictEqual(eventType, 'agent-tracing');
      checkTracingData(data, null, agentId, wid, 'myapp');
      const spanTypes = [ 'dns_lookup', 'dns_lookup_service', 'dns_resolve'];
      for (const span of data.body.spans) {
        validateSpan(span, spanTypes[totalSpans], wid);
        totalSpans++;
      }
      if (totalSpans === 3) {
        resolve();
      }
    }, 1));
  });
}

function testCustomTracesChangingAppName(playground) {
  return new Promise((resolve) => {
    const opts = {
      opts: {
        env: {
          NSOLID_TRACING_ENABLED: 1,
          NSOLID_APPNAME: 'myapp',
        },
      },
    };

    playground.bootstrap(opts, mustSucceed(async (agentId) => {
      await playground.client.config({ app: 'myotherapp' });
      await playground.client.tracing('custom', threadId);
    }), mustCall((eventType, agentId, data) => {
      console.log(`${eventType}, ${agentId}`);
      assert.strictEqual(eventType, 'agent-tracing');
      checkTracingData(data, null, agentId, threadId, 'myotherapp');
      assert.strictEqual(data.body.spans.length, 1);
      validateSpan(data.body.spans[0], 'custom', threadId);
      resolve();
    }));
  });
}

function testCustomTracesOnWorker(playground) {
  return new Promise((resolve) => {
    let wid;
    const opts = {
      args: [ '-w', 1 ],
      opts: {
        env: {
          NSOLID_TRACING_ENABLED: 1,
          NSOLID_APPNAME: 'myapp',
        },
      },
    };

    playground.bootstrap(opts, mustSucceed(async (agentId) => {
      const workers = await playground.client.workers();
      wid = workers[0];
      await playground.client.tracing('custom', wid);
    }), mustCall((eventType, agentId, data) => {
      console.log(`${eventType}, ${agentId}`);
      assert.strictEqual(eventType, 'agent-tracing');
      checkTracingData(data, null, agentId, wid, 'myapp');
      assert.strictEqual(data.body.spans.length, 1);
      validateSpan(data.body.spans[0], 'custom', wid);
      resolve();
    }));
  });
}

function testTracingEnabledToggle(playground) {
  return new Promise((resolve) => {
    let totalSpans = 0;
    let phase = 'initial';
    const opts = {
      opts: {
        env: {
          NSOLID_TRACING_ENABLED: 1,
          NSOLID_APPNAME: 'myapp',
        },
      },
    };

    playground.bootstrap(opts, mustSucceed(async (agentId) => {
      await playground.client.tracing('http', threadId);
    }), mustCallAtLeast(async (eventType, agentId, data) => {
      if (phase === 'done')
        return;

      console.log(`${eventType}, ${agentId}, phase: ${phase}`);
      assert.strictEqual(eventType, 'agent-tracing');
      assert.notStrictEqual(phase, 'disabled');

      if (phase === 'initial') {
        checkTracingData(data, null, agentId, threadId, 'myapp');
        const spanTypes = [ 'http_server', 'http_client'];
        for (const span of data.body.spans) {
          validateSpan(span, spanTypes[totalSpans], threadId);
          totalSpans++;
        }

        if (totalSpans === 2) {
          totalSpans = 0;
          phase = 'disabled';
          await playground.client.disableTraces();
          await playground.client.tracing('http', threadId);
          await delay(200);
          await playground.client.enableTraces();
          phase = 'reenabled';
          await playground.client.tracing('http', threadId);
        }
      } else if (phase === 'reenabled') {
        checkTracingData(data, null, agentId, threadId, 'myapp');
        const spanTypes = [ 'http_server', 'http_client'];
        for (const span of data.body.spans) {
          validateSpan(span, spanTypes[totalSpans], threadId);
          totalSpans++;
        }

        if (totalSpans === 2) {
          phase = 'done';
          resolve();
        }
      }
    }, 2));
  });
}

tests.push({
  name: 'should work for http transactions',
  test: testHttpTransactions,
});

tests.push({
  name: 'should work for http transactions immediately on startup',
  test: testHttpTransactionsOnStartup,
});

tests.push({
  name: 'should work for http transactions on a worker',
  test: testHttpTransactionsOnWorker,
});

tests.push({
  name: 'should work for dns transactions',
  test: testDnsTransactions,
});

tests.push({
  name: 'should work for dns transactions on a worker',
  test: testDnsTransactionsOnWorker,
});

tests.push({
  name: 'should work for custom traces changing app name',
  test: testCustomTracesChangingAppName,
});

tests.push({
  name: 'should work for custom traces on a worker',
  test: testCustomTracesOnWorker,
});

tests.push({
  name: 'should respect tracingEnabled toggled via enableTraces/disableTraces',
  test: testTracingEnabledToggle,
});

const config = {
  commandBindAddr: 'tcp://*:9001',
  dataBindAddr: 'tcp://*:9002',
  bulkBindAddr: 'tcp://*:9003',
  HWM: 0,
  bulkHWM: 0,
  commandTimeoutMilliseconds: 5000,
  saas: false,
};

const playground = new TestPlayground(config);
await playground.startServer();

for (const { name, test } of tests) {
  console.log(`[local] tracing generation ${name}`);
  await test(playground);
  await playground.stopClient();
}

await playground.stopServer();
