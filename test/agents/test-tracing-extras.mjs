// Flags: --expose-internals
import { mustCall, mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import nsolid from 'nsolid';
import { GRPCServer } from '../common/nsolid-grpc-agent/index.js';
import { OTLPServer, OTLPGRPCServer } from '../common/nsolid-otlp-agent/index.js';

const require = createRequire(import.meta.url);
const fixtures = require('../common/fixtures');
const traceId = '0123456789abcdef0123456789abcdef';
const spanId = '0123456789abcdef';
const time = 1700000000000;
const invalidAttributes = [null, false, 1, 'invalid', ['invalid']];

if (process.argv[2] === 'child') {
  nsolid.start({ pauseMetrics: true });
  const api = require(require.resolve('@opentelemetry/api', { paths: [fixtures.fixturesDir] }));
  nsolid.otel.register(api);
  const span = api.trace.getTracer('extras').startSpan('with-extras', {
    links: [{
      context: {
        traceId, spanId, traceFlags: 1, isRemote: true,
        traceState: api.createTraceState('vendor=value'),
      },
      attributes: { reason: 'batch', count: 2, cached: true, keys: ['a', 'b'] },
    }, {
      context: { traceId, spanId, traceFlags: 0 },
    }, {
      context: api.INVALID_SPAN_CONTEXT,
    }, ...invalidAttributes.map((attributes) => ({
      context: { traceId, spanId, traceFlags: 0 }, attributes,
    })), ...[
      { traceFlags: 'sampled' }, { traceFlags: null }, { traceFlags: 1.5 },
      { traceFlags: -1 }, { traceFlags: 256 }, { isRemote: 'remote' },
      { traceState: { serialize: () => 7 } },
    ].map((context) => ({
      context: { traceId, spanId, traceFlags: 0, ...context },
    }))],
  });
  span.addEvent('cache-miss', { key: 'user:42', retries: 2, cached: false,
                                keys: ['a', 'b'] }, time);
  span.addEvent('date', new Date(time));
  span.addEvent('hrtime', [time / 1000, 123456789]);
  span.recordException(new Error('boom'), time);
  span.addEvent('default');
  for (const name of [undefined, null, false, 1, [], {}]) {
    span.addEvent(name, {}, time);
  }
  for (const invalidTime of ['invalid', true, Infinity, NaN, -1,
                             Number.MAX_VALUE, [], [0], [0, '1'],
                             [-1, 0], [0, -1], [0, 1e9], [1e20, 0], [0, 1.5]]) {
    span.addEvent('invalid-time', {}, invalidTime);
  }
  for (const attrs of invalidAttributes) {
    span.addEvent('invalid-attributes', attrs, time);
  }
  span.end();
  span.addEvent('after-end');
  process.on('message', mustCall(() => process.exit(0)));
} else {
  function attributes(values) {
    return Object.fromEntries(values.map(({ key, value }) => [key, value]));
  }

  function id(value) {
    return Buffer.from(value.data || value, value.data ? undefined : 'base64').toString('hex');
  }

  for (const [Server, protocol] of [[GRPCServer, 'console'],
                                    [OTLPServer, 'http'],
                                    [OTLPGRPCServer, 'grpc']]) {
    await new Promise((resolve) => {
      const server = new Server();
      server.start(mustSucceed((port) => {
        const env = { ...process.env, NSOLID_TRACING_ENABLED: '1' };
        if (protocol === 'console') {
          env.NSOLID_GRPC = `localhost:${port}`;
          env.NSOLID_GRPC_INSECURE = '1';
        } else {
          env.NSOLID_OTLP = 'otlp';
          env.NSOLID_OTLP_CONFIG = JSON.stringify({ url: `http://localhost:${port}`, protocol });
        }
        const child = fork(fileURLToPath(import.meta.url), ['child'], { env });
        let checked = false;
        server.on('spans', mustCallAtLeast((data) => {
          if (checked) return;
          const spans = data.resourceSpans.flatMap((rs) => rs.scopeSpans.flatMap((ss) => ss.spans));
          const span = spans.find((s) => s.name === 'with-extras');
          if (!span) return;
          checked = true;
          assert.deepStrictEqual(span.events.map((e) => e.name),
                                 ['cache-miss', 'date', 'hrtime', 'exception', 'default',
                                  ...invalidAttributes.map(() => 'invalid-attributes')]);
          assert.strictEqual(BigInt(span.events[0].timeUnixNano), BigInt(time) * 1000000n);
          assert.strictEqual(span.events[1].timeUnixNano, span.events[0].timeUnixNano);
          const hrtime = BigInt(span.events[2].timeUnixNano);
          assert.strictEqual(hrtime, BigInt(time) * 1000000n + 123456789n);
          const event = attributes(span.events[0].attributes);
          assert.strictEqual(event.key.stringValue, 'user:42');
          assert.strictEqual(event.retries.intValue, '2');
          assert.strictEqual(event.cached.boolValue, false);
          assert.deepStrictEqual(event.keys.arrayValue.values.map((v) => v.stringValue), ['a', 'b']);
          const exception = attributes(span.events[3].attributes);
          assert.strictEqual(exception['exception.type'].stringValue, 'Error');
          assert.strictEqual(exception['exception.message'].stringValue, 'boom');
          assert.match(exception['exception.stacktrace'].stringValue, /Error: boom/);
          const defaultTime = BigInt(span.events[4].timeUnixNano);
          assert.ok(defaultTime >= BigInt(span.startTimeUnixNano));
          assert.ok(defaultTime <= BigInt(Date.now()) * 1000000n);
          for (const event of span.events.slice(5)) {
            assert.strictEqual(event.attributes?.length || 0, 0);
          }
          assert.strictEqual(span.links.length, 2 + invalidAttributes.length);
          for (const link of span.links.slice(2)) {
            assert.strictEqual(link.attributes?.length || 0, 0);
          }
          for (const link of span.links) {
            assert.strictEqual(id(link.traceId), traceId);
            assert.strictEqual(id(link.spanId), spanId);
          }
          assert.strictEqual(span.links[0].traceState, 'vendor=value');
          const link = attributes(span.links[0].attributes);
          assert.strictEqual(link.reason.stringValue, 'batch');
          assert.strictEqual(link.count.intValue, '2');
          assert.strictEqual(link.cached.boolValue, true);
          assert.deepStrictEqual(link.keys.arrayValue.values.map((v) => v.stringValue), ['a', 'b']);
          child.send('exit');
        }));
        child.on('exit', mustCall((code, signal) => {
          assert.strictEqual(code, 0);
          assert.strictEqual(signal, null);
          assert.ok(checked);
          server.close();
          resolve();
        }));
      }));
    });
  }
}
