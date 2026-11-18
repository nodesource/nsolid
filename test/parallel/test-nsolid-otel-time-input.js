// Flags: --expose-internals --no-warnings
'use strict';

const common = require('../common');
const assert = require('assert');
const fixtures = require('../common/fixtures');
const { internalBinding, primordials } = require('internal/test/binding');
const { getTimeOriginTimestamp } = require('internal/perf/utils');
const { readFileSync } = require('fs');
const { resolve } = require('path');
const { compileFunction } = require('vm');

// Read the shared symbol from source when testing against an older binary.
const coreModule = { exports: {} };
compileFunction(readFileSync(resolve(__dirname,
                                     '../../lib/internal/otel/core.js'), 'utf8'),
                ['require', 'primordials', 'module'])(require, primordials, coreModule);
const { kStartSpan } = coreModule.exports;

const origin = getTimeOriginTimestamp();
let monotonic = 10000;
let offset = 0;
let monotonicReads = 0;
let wallReads = 0;
const now = () => {
  monotonicReads++;
  return monotonic;
};
// Load the source with independent clocks without changing the host clock.
const traceModule = { exports: {} };
const binding = internalBinding('nsolid_api');
const testBinding = {
  ...binding,
};
compileFunction(readFileSync(resolve(__dirname,
                                     '../../lib/internal/otel/trace.js'), 'utf8'),
                ['require', 'internalBinding', 'primordials', 'module'])(
  (id) => {
    if (id === 'internal/perf/utils') return { now, getTimeOriginTimestamp };
    if (id === 'internal/otel/core') return { ...require(id), kStartSpan };
    return require(id);
  },
  (id) => (id === 'nsolid_api' ? testBinding : internalBinding(id)),
  Object.setPrototypeOf({ DateNow: () => {
    wallReads++;
    return origin + monotonic + offset;
  } }, primordials),
  traceModule);
const { tracerProvider } = traceModule.exports;
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixtures.fixturesDir] }));
require('nsolid').otel.register(api);

binding.trace_flags[0] = binding.nsolid_consts.kSpanCustom;
binding.trace_sample_rate[0] = 1;
const timestamps = [];
const events = [];
let lastMonotonicStart;
testBinding.pushSpanDataDouble = common.mustCallAtLeast(
  (high, low, type, time, monotonicStart) => {
    assert.strictEqual(typeof time, 'number');
    assert.strictEqual(typeof monotonicStart, 'number');
    if (type === binding.nsolid_consts.kSpanStart) {
      lastMonotonicStart = monotonicStart;
    }
    timestamps.push(time);
  });
testBinding.pushSpanDataString = (high, low, type, value) => {
  if (type === binding.nsolid_consts.kSpanEvent) {
    events.push(JSON.parse(value).time);
  }
};
testBinding.pushSpanDataUint64 = () => {};

const epoch = Math.floor(origin) + 1000;
const relative = 123.5;
const tracer = tracerProvider.getTracer('time-input');
assert.strictEqual(typeof kStartSpan, 'symbol');
assert.strictEqual(tracer._startSpan, undefined);
for (const [input, expected] of [
  [epoch, epoch],
  [epoch - 2000, epoch - 2000],
  [origin / 2 - 1, origin + (origin / 2 - 1)],
  [origin / 2, origin / 2],
  [origin / 2 + 1, origin / 2 + 1],
  [new Date(epoch), epoch],
  [[Math.floor(epoch / 1000), (epoch % 1000) * 1e6], epoch],
  [relative, origin + relative],
  [0, origin],
  [-1, origin - 1],
  [new Date(0), 0],
  [[0, 0], 0],
  [9223372036854, 9223372036854],
]) {
  const span = tracer.startSpan('time-input', { startTime: input });
  span.addEvent('overload', input);
  span.addEvent('attributes', {}, input);
  span.recordException('exception', input);
  span.end(input);
  assert.strictEqual(timestamps.shift(), expected);
  assert.strictEqual(timestamps.shift(), expected);
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(events.shift(), expected);
  }
}

for (const input of [undefined, null, {}, 'invalid', NaN, Infinity,
                     new Date(NaN), [NaN, 0], [1], [1, Infinity],
                     Number.MAX_VALUE, -Number.MAX_VALUE, [-1, 0], [1e20, 0],
                     [0, -1], [0, 1e9], [0, 1.5], [1.5, 0],
                     new Date(-1), new Date(9223372036855),
                     2 ** 63 / 1e6, [9223372036, 854775808]]) {
  const before = now();
  const span = tracer.startSpan('fallback', { startTime: input });
  span.addEvent('fallback', {}, input);
  span.end(input);
  const after = now();
  for (const time of timestamps.splice(0)) {
    assert.ok(time >= origin + before && time <= origin + after);
  }
  const time = events.shift();
  assert.ok(time >= origin + before && time <= origin + after);
}

// Wall and monotonic clocks can disagree; durations must not be negative.
const future = Math.floor(origin + now()) + 60000;
for (const endTime of [undefined, future - 1, new Date(future - 1)]) {
  const span = tracer.startSpan('negative-duration', { startTime: future });
  span.end(endTime);
  assert.strictEqual(timestamps.shift(), future);
  assert.strictEqual(timestamps.shift(), future);
}

// New spans use the current wall clock; existing spans keep elapsed durations.
for (const shift of [3600000, -3600000]) {
  offset = 0;
  const before = monotonic;
  const span = tracer.startSpan('clock-step');
  assert.strictEqual(timestamps.shift(), origin + before);
  offset = shift;
  monotonic += 2000;
  span.addEvent('after-step');
  span.recordException('after-step');
  span.end();
  assert.strictEqual(timestamps.shift(), origin + before + 2000);
  assert.deepStrictEqual(events.splice(0),
                         [origin + before + 2000, origin + before + 2000]);

  const beforeStartReads = monotonicReads;
  const resumed = tracer[kStartSpan]('after-resume', {
    startTime: monotonic,
  });
  assert.strictEqual(monotonicReads, beforeStartReads);
  assert.strictEqual(timestamps.shift(), origin + monotonic + shift);
  // DNS spans reuse their captured monotonic start and end.
  monotonic += 100;
  const beforeEndReads = monotonicReads;
  resumed.end(monotonic);
  assert.strictEqual(monotonicReads, beforeEndReads);
  assert.strictEqual(timestamps.shift(), origin + monotonic + shift);

  // Explicit relative starts still use the same clock correction.
  const internal = tracer.startSpan('relative', { startTime: monotonic - 100 });
  assert.strictEqual(timestamps.shift(), origin + monotonic - 100 + shift);
  internal.end(monotonic);
  assert.strictEqual(timestamps.shift(), origin + monotonic + shift);

  // Explicit epoch timestamps must not receive the clock correction again.
  const explicit = tracer.startSpan('explicit', { startTime: new Date(epoch) });
  assert.strictEqual(timestamps.shift(), epoch);
  explicit.addEvent('default-time');
  explicit.end();
  assert.strictEqual(events.shift(), origin + monotonic + shift);
  assert.strictEqual(timestamps.shift(),
                     Math.max(epoch, origin + monotonic + shift));
}

// Public options cannot select internal timing or native span types.
for (const startTime of [
  new Date(epoch),
  [Math.floor(epoch / 1000), (epoch % 1000) * 1e6],
]) {
  const span = tracer.startSpan('public-options', {
    internal: true,
    type: binding.nsolid_consts.kSpanDns,
    startTime,
  });
  assert.strictEqual(span.type, binding.nsolid_consts.kSpanCustom);
  assert.ok(Number.isNaN(lastMonotonicStart));
  assert.strictEqual(timestamps.shift(), epoch);
  span.end(epoch);
  assert.strictEqual(timestamps.shift(), epoch);
}

const publicOptions = {
  startTime: new Date(epoch),
  get internal() { return assert.fail('Public API read internal'); },
  get type() { return assert.fail('Public API read type'); },
};
tracer.startActiveSpan('public-active', publicOptions, common.mustCall(() => {
  assert.strictEqual(timestamps.shift(), epoch);
}));

// Internal starts reuse finite monotonic values, including zero.
for (const startTime of [0, monotonic - 5, monotonic]) {
  const beforeMonotonic = monotonicReads;
  const beforeWall = wallReads;
  const startTimestamp = origin + monotonic + offset;
  const span = tracer[kStartSpan]('internal-cost', { startTime });
  assert.strictEqual(monotonicReads, beforeMonotonic);
  assert.strictEqual(wallReads, beforeWall + 1);
  assert.strictEqual(timestamps.shift(), startTimestamp);
  span.end(startTime + 100);
  assert.strictEqual(monotonicReads, beforeMonotonic);
  assert.strictEqual(timestamps.shift(), startTimestamp + 100);
}

// Reject nonnumeric clock values even through the private entry point.
for (const startTime of [
  'invalid', new Date(epoch), {}, [1, 0],
  NaN, Infinity, -Infinity, 1n, Symbol('start'),
]) {
  const beforeMonotonic = monotonicReads;
  const startTimestamp = origin + monotonic + offset;
  const span = tracer[kStartSpan]('invalid-internal', { startTime });
  assert.strictEqual(monotonicReads, beforeMonotonic + 1);
  assert.strictEqual(lastMonotonicStart, monotonic);
  assert.strictEqual(timestamps.shift(), startTimestamp);
  span.end();
  assert.strictEqual(timestamps.shift(), startTimestamp);
}

// Default starts read each clock once and send only one start item.
for (const internal of [false, true]) {
  const beforeMonotonic = monotonicReads;
  const beforeWall = wallReads;
  const sampled = internal ? tracer[kStartSpan]('default-cost') :
    tracer.startSpan('default-cost');
  assert.strictEqual(monotonicReads, beforeMonotonic + 1);
  assert.strictEqual(wallReads, beforeWall + 1);
  assert.strictEqual(timestamps.length, 1);
  sampled.end();
  assert.strictEqual(timestamps.length, 2);
  timestamps.length = 0;
}

// Unsampled spans must not read clocks or send any properties.
binding.trace_sample_rate[0] = 0;
const afterMonotonic = monotonicReads;
const afterWall = wallReads;
for (const internal of [false, true]) {
  const unsampled = internal ?
    tracer[kStartSpan]('unsampled', { startTime: monotonic }) :
    tracer.startSpan('unsampled');
  unsampled.addEvent('ignored');
  unsampled.end();
}
assert.strictEqual(monotonicReads, afterMonotonic);
assert.strictEqual(wallReads, afterWall);
assert.strictEqual(timestamps.length, 0);

// A public internal flag must not bypass disabled tracing.
binding.trace_flags[0] = 0;
binding.trace_sample_rate[0] = 1;
const disabled = tracer.startSpan('disabled', { internal: true });
assert.strictEqual(disabled.spanContext().traceFlags, api.TraceFlags.NONE);
assert.strictEqual(timestamps.length, 0);
