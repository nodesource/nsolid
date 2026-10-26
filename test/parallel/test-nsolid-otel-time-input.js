// Flags: --expose-internals --no-warnings
'use strict';

const common = require('../common');
const assert = require('assert');
const fixtures = require('../common/fixtures');
const { internalBinding } = require('internal/test/binding');
const { tracerProvider } = require('internal/otel/trace');
const { getTimeOriginTimestamp, now } = require('internal/perf/utils');
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixtures.fixturesDir] }));
require('nsolid').otel.register(api);

const binding = internalBinding('nsolid_api');
binding.trace_flags[0] = binding.nsolid_consts.kSpanCustom;
binding.trace_sample_rate[0] = 1;
const timestamps = [];
const events = [];
binding.pushSpanDataDouble = common.mustCallAtLeast((high, low, type, time) => {
  assert.strictEqual(typeof time, 'number');
  timestamps.push(time);
});
binding.pushSpanDataString = (high, low, type, value) => {
  if (type === binding.nsolid_consts.kSpanEvent) {
    events.push(JSON.parse(value).time);
  }
};
binding.pushSpanDataUint64 = () => {};

const origin = getTimeOriginTimestamp();
const epoch = Math.floor(origin) + 1000;
const relative = 123.5;
const tracer = tracerProvider.getTracer('time-input');
for (const [input, expected] of [
  [epoch, epoch - origin],
  [new Date(epoch), epoch - origin],
  [[Math.floor(epoch / 1000), (epoch % 1000) * 1e6], epoch - origin],
  [relative, relative],
  [0, 0],
  [-1, -1],
  [new Date(0), -origin],
  [[0, 0], -origin],
  [9223372036854, 9223372036854 - origin],
]) {
  const span = tracer.startSpan('time-input', { startTime: input });
  span.addEvent('overload', input);
  span.addEvent('attributes', {}, input);
  span.recordException('exception', input);
  span.end(input);
  assert.strictEqual(timestamps.shift(), expected);
  assert.strictEqual(timestamps.shift(), expected);
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(events.shift(), origin + expected);
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
    assert.ok(time >= before && time <= after);
  }
  const time = events.shift();
  assert.ok(time >= origin + before && time <= origin + after);
}

// Wall and monotonic clocks can disagree; durations must not be negative.
const future = Math.floor(origin + now()) + 60000;
for (const endTime of [undefined, future - 1, new Date(future - 1)]) {
  const span = tracer.startSpan('negative-duration', { startTime: future });
  span.end(endTime);
  assert.strictEqual(timestamps.shift(), future - origin);
  assert.strictEqual(timestamps.shift(), future - origin);
}
