// Flags: --expose-internals
import { mustCall, mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { isMainThread, threadId, Worker } from 'node:worker_threads';
import nsolid from 'nsolid';
import otelCore from 'internal/otel/core';
import nsolidTrace from 'internal/nsolid_trace';
import fixtures from '../common/fixtures.js';
import { GRPCServer } from '../common/nsolid-grpc-agent/index.js';

const { getApi } = otelCore;
const { getTraceFlags, nsolidTracer } = nsolidTrace;

async function writeLogs(apiName) {
  const { context, trace, INVALID_SPAN_CONTEXT } = getApi();
  function log(name, level, spanContext = {}) {
    nsolid.logger[level]({ threadId, apiName, name, ...spanContext });
  }

  log('before', 'info');
  const span = trace.getTracer('log-context').startSpan('active');
  const spanContext = span.spanContext();
  assert.ok(trace.isSpanContextValid(spanContext));
  assert.strictEqual(spanContext.traceFlags, 1);
  await context.with(trace.setSpan(context.active(), span), async () => {
    log('active', 'debug', spanContext);
    await setImmediate();
    log('async', 'info', spanContext);
  });
  span.end();

  const twoByte = {
    ...spanContext,
    traceId: (`\u0100${spanContext.traceId.repeat(2)}`).slice(1, 33),
    spanId: (`\u0100${spanContext.spanId.repeat(2)}`).slice(1, 17),
  };
  context.with(trace.setSpanContext(context.active(), twoByte), () => {
    log('two-byte', 'info', twoByte);
  });

  for (const traceFlags of [-1, '257']) {
    const flagsContext = { ...spanContext, traceFlags };
    context.with(trace.setSpanContext(context.active(), flagsContext), () => {
      log(`flags-${traceFlags}`, 'info', {
        ...flagsContext,
        traceFlags: traceFlags === -1 ? 255 : 1,
      });
    });
  }

  const unsampled = { ...spanContext, traceFlags: 0 };
  context.with(trace.setSpanContext(context.active(), unsampled), () => {
    log('unsampled', 'warn', unsampled);
  });
  context.with(trace.setSpanContext(context.active(), INVALID_SPAN_CONTEXT), () => {
    log('invalid', 'error');
  });
  const malformed = { ...spanContext, spanId: 'invalid' };
  context.with(trace.setSpanContext(context.active(), malformed), () => {
    log('malformed', 'error');
  });
  log('after', 'fatal');
}

if (process.argv[2] === 'child') {
  const interval = setInterval(() => {}, 1000);
  if (isMainThread)
    nsolid.start({ pauseMetrics: true });
  while (!getTraceFlags())
    await once(nsolidTracer, 'flagsUpdated');

  await writeLogs('internal');
  const require = createRequire(import.meta.url);
  const api = require(require.resolve('@opentelemetry/api', { paths: [fixtures.fixturesDir] }));
  assert.strictEqual(nsolid.otel.register(api), true);
  await writeLogs('registered');

  if (isMainThread) {
    const worker = new Worker(new URL(import.meta.url), { argv: ['child'] });
    const exited = once(worker, 'exit');
    process.on('message', mustCall(async (message) => {
      assert.strictEqual(message, 'exit');
      const [code] = await exited;
      assert.strictEqual(code, 0);
      clearInterval(interval);
      process.exit(0);
    }));
  } else {
    clearInterval(interval);
  }
} else {
  for (const saas of [false, true]) {
    const server = new GRPCServer();
    const port = await new Promise((resolve) => server.start(mustSucceed(resolve)));
    const received = new Set();
    let child;
    server.on('logs', mustCallAtLeast((data) => {
      for (const resource of data.resourceLogs) {
        for (const scope of resource.scopeLogs) {
          for (const record of scope.logRecords) {
            const expected = JSON.parse(record.body.stringValue);
            const key = `${expected.threadId}:${expected.apiName}:${expected.name}`;
            assert.ok(!received.has(key), key);
            received.add(key);
            assert.strictEqual(Buffer.from(record.traceId.data).toString('hex'),
                               expected.traceId ?? '', key);
            assert.strictEqual(Buffer.from(record.spanId.data).toString('hex'),
                               expected.spanId ?? '', key);
            assert.strictEqual(record.flags, expected.traceFlags ?? 0, key);
          }
        }
      }
      if (received.size === 40)
        child.send('exit');
    }));
    const endpoint = `localhost:${port}`;
    child = fork(new URL(import.meta.url), ['child'], {
      env: {
        NSOLID_TRACING_ENABLED: '1',
        NSOLID_GRPC_INSECURE: '1',
        ...(saas ? {
          NSOLID_SAAS: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbtesting.${endpoint}`,
        } : { NSOLID_GRPC: endpoint }),
      },
    });
    const [code, signal] = await once(child, 'exit');
    assert.strictEqual(code, 0);
    assert.strictEqual(signal, null);
    assert.strictEqual(received.size, 40);
    server.close();
  }
}
