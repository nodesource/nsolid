// Flags: --expose-internals --no-warnings
'use strict';

// Span IDs are kept as words and the hex SpanContext is built on the first
// spanContext() call. Check that it still looks like a plain OTel SpanContext
// and that parents of every kind are inherited as before.

require('../common');
const assert = require('assert');
const fixtures = require('../common/fixtures');
const { internalBinding } = require('internal/test/binding');

const binding = internalBinding('nsolid_api');
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixtures.fixturesDir] }));
binding.trace_flags[0] = binding.nsolid_consts.kSpanCustom;
binding.trace_sample_rate[0] = 1;
require('nsolid').otel.register(api);

const tracer = api.trace.getTracer('span-context');
const childOf = (parent, name = 'child') =>
  tracer.startSpan(name, {}, api.trace.setSpan(api.context.active(), parent));

function checkIds(span) {
  const { spanId, traceId } = span.spanContext();
  const id = (BigInt(span.spanIdHigh) << 32n) | BigInt(span.spanIdLow);
  assert.strictEqual(spanId, id.toString(16).padStart(16, '0'));
  assert.match(traceId, /^[0-9a-f]{32}$/);
  assert(api.trace.isSpanContextValid(span.spanContext()));
}

// Own data properties, so spreading and serializing keep the IDs.
{
  const span = tracer.startSpan('root');
  const ctx = span.spanContext();
  assert.strictEqual(span.spanContext(), ctx);
  checkIds(span);
  assert.deepStrictEqual(Object.keys({ ...ctx }).sort(),
                         ['spanId', 'traceFlags', 'traceId', 'traceState']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx)), {
    spanId: ctx.spanId,
    traceFlags: api.TraceFlags.SAMPLED,
    traceId: ctx.traceId,
  });
  span.end();
}

// Children inherit the trace whether or not the parent's hex IDs were built.
for (const materializeParent of [true, false]) {
  const root = tracer.startSpan('root');
  if (materializeParent) root.spanContext();
  const child = childOf(root);
  const grandchild = childOf(child, 'grandchild');
  for (const span of [root, child, grandchild]) checkIds(span);
  const traceId = root.spanContext().traceId;
  assert.strictEqual(child.spanContext().traceId, traceId);
  assert.strictEqual(grandchild.spanContext().traceId, traceId);
  assert.notStrictEqual(child.spanContext().spanId, root.spanContext().spanId);
  assert.strictEqual(child.spanContext().traceFlags, api.TraceFlags.SAMPLED);
  for (const span of [grandchild, child, root]) span.end();
}

// Remote parents: the trace ID and trace state are inherited as given, even
// when they aren't lowercase hex.
{
  const traceState = { serialize: () => 'a=b' };
  for (const traceFlags of [api.TraceFlags.SAMPLED, api.TraceFlags.NONE])
    for (const traceId of ['0123456789abcdef0123456789abcdef',
                           '0123456789ABCDEF0123456789ABCDEF']) {
      const context = api.trace.setSpanContext(api.context.active(), {
        traceId,
        spanId: '0123456789ABCDEF',
        traceFlags,
        traceState,
      });
      const child = tracer.startSpan('remote child', {}, context);
      const ctx = child.spanContext();
      assert.strictEqual(ctx.traceId, traceId);
      assert.strictEqual(ctx.traceState, traceState);
      assert.strictEqual(ctx.traceFlags, traceFlags);
      assert(api.trace.isSpanContextValid(ctx));
      // A local child of that span keeps the same trace.
      const grandchild = childOf(child);
      assert.strictEqual(grandchild.spanContext().traceId, traceId);
      assert.strictEqual(grandchild.spanContext().traceState, traceState);
      grandchild.end();
      child.end();
    }
}

// Invalid parents start a new trace for spans started by user code.
{
  const context = api.trace.setSpanContext(api.context.active(),
                                           api.INVALID_SPAN_CONTEXT);
  const span = tracer.startSpan('invalid parent', {}, context);
  checkIds(span);
  assert.notStrictEqual(span.spanContext().traceId,
                        api.INVALID_SPAN_CONTEXT.traceId);
  span.end();
}

// `root: true` ignores the active parent.
{
  const parent = tracer.startSpan('parent');
  const span = tracer.startSpan('root', { root: true },
                                api.trace.setSpan(api.context.active(), parent));
  assert.notStrictEqual(span.spanContext().traceId,
                        parent.spanContext().traceId);
  span.end();
  parent.end();
}
