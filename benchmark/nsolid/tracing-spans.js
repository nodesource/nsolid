'use strict';

const assert = require('assert');
const common = require('../common.js');

const bench = common.createBenchmark(main, {
  type: ['root', 'child'],
  n: [1e5],
}, {
  flags: ['--expose-internals', '--no-warnings'],
});

function main({ n, type }) {
  assert(Number.isInteger(n) && n > 0);
  assert(type === 'root' || type === 'child');
  const binding = common.binding('nsolid_api');
  const { getApi } = require('internal/otel/core');
  const { tracerProvider } = require('internal/otel/trace');
  const api = getApi();
  const tracer = tracerProvider.getTracer('benchmark');
  binding.trace_flags[0] = binding.nsolid_consts.kSpanCustom;
  binding.trace_sample_rate[0] = 0;
  const parent = {
    spanId: '1234567890abcdef',
    traceId: '1234567890abcdef1234567890abcdef',
    traceFlags: 0,
  };
  const context = type === 'root' ? api.ROOT_CONTEXT :
    api.trace.setSpanContext(api.ROOT_CONTEXT, parent);
  let span;
  function run(count) {
    let checksum = 0;
    for (let i = 0; i < count; i++) {
      span = tracer.startSpan('benchmark', undefined, context);
      span.end();
      const spanContext = span.spanContext();
      checksum ^= span.spanIdLow ^ spanContext.spanId.charCodeAt(0) ^
        spanContext.traceId.charCodeAt(0);
    }
    return checksum;
  }

  run(Math.min(n, 1e4));
  bench.start();
  const checksum = run(n);
  bench.end(n);
  assert(Number.isInteger(checksum));
  assert.strictEqual(span.ended, true);
  assert.strictEqual(span.spanContext().traceFlags, 0);
  assert.match(span.spanContext().spanId, /^[0-9a-f]{16}$/);
  assert.match(span.spanContext().traceId, /^[0-9a-f]{32}$/);
  if (type === 'child') {
    assert.strictEqual(span.spanContext().traceId, parent.traceId);
  }
}
