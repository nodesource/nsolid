// Flags: --expose-internals
'use strict';

const common = require('../common');
const assert = require('assert');
const { spawnSync } = require('child_process');
const fixtures = require('../common/fixtures');

const cases = {
  'default': undefined,
  'polluted-default': undefined,
  'explicit': { traces: true, metrics: false },
  'both': { metrics: true },
  'metrics-only': { traces: false, metrics: true },
  'neither': { traces: false, metrics: false },
  'late': { metrics: true },
  'meter-conflict': { metrics: true },
  'trace-conflict': { metrics: true },
  'context-conflict': { metrics: true },
  'preinstalled-instrumentation': { metrics: true },
  'invalid': { traces: false, metrics: true },
};
const mode = process.argv[2];
if (mode === undefined) {
  for (const name of Object.keys(cases)) {
    const child = spawnSync(process.execPath,
                            [...process.execArgv, __filename, name],
                            { encoding: 'utf8' });
    assert.strictEqual(child.status, 0, `${name}: ${child.stderr}`);
  }
  return;
}

const nsolid = require('nsolid');
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixtures.fixturesDir] }));
const metrics = require(require.resolve('@opentelemetry/api-metrics',
                                        { paths: [fixtures.fixturesDir] })).metrics;
const trace = require('internal/nsolid_trace');
const { meterProvider } = require('internal/otel/metrics');
let flags = mode === 'late' ? 0 : 1;
// Exercise registration and flag transitions without needing an agent.
trace.getTraceFlags = () => flags;

const options = cases[mode];
const traces = options?.traces ?? true;
const wantsMetrics = options?.metrics ?? false;
const contextConflict = mode === 'context-conflict' ||
  mode === 'preinstalled-instrumentation';
const traceConflict = mode === 'trace-conflict' || contextConflict;
const contextMarker = {};
const tracerMarker = {};
const applicationMeterProvider = { getMeter() {} };
if (!traces || contextConflict) {
  api.context.setGlobalContextManager({
    active: () => contextMarker,
    disable() { throw new Error('Application context manager disabled'); },
  });
}
if (!traces || traceConflict) {
  api.trace.setGlobalTracerProvider({ getTracer: () => tracerMarker });
}
if (mode === 'meter-conflict') {
  metrics.setGlobalMeterProvider(applicationMeterProvider);
  common.expectWarning('Warning',
                       'N|Solid could not install its OpenTelemetry meter ' +
                       'provider because another provider is already registered.',
                       'NSOLID_OTEL_METER_PROVIDER_ALREADY_REGISTERED');
}

const calls = { context: 0, trace: 0, metrics: 0, contextDisable: 0,
                traceDisable: 0, enable: 0, disable: 0 };
for (const [object, method, key] of [
  [api.context, 'setGlobalContextManager', 'context'],
  [api.trace, 'setGlobalTracerProvider', 'trace'],
  [metrics, 'setGlobalMeterProvider', 'metrics'],
  [api.context, 'disable', 'contextDisable'],
  [api.trace, 'disable', 'traceDisable'],
]) {
  const original = object[method].bind(object);
  object[method] = (...args) => {
    calls[key]++;
    return original(...args);
  };
}
const externalApi = { ...api, metrics };
const instrumentation = {
  enable() { calls.enable++; },
  disable() { calls.disable++; },
};
if (mode === 'preinstalled-instrumentation') {
  nsolid.otel.registerInstrumentations(instrumentation);
}
if (mode === 'invalid') {
  for (const invalid of [ null, [], false, 1, 'options',
                          { traces: 1 }, { metrics: 'true' } ]) {
    assert.throws(() => nsolid.otel.register(externalApi, invalid), {
      code: 'ERR_INVALID_ARG_TYPE',
    });
  }
  assert.strictEqual(calls.context + calls.trace + calls.metrics, 0);
}

if (mode === 'polluted-default') {
  Object.prototype.traces = false;
  Object.prototype.metrics = true;
}
try {
  assert.strictEqual(nsolid.otel.register(externalApi, options), !traceConflict);
} finally {
  if (mode === 'polluted-default') {
    delete Object.prototype.traces;
    delete Object.prototype.metrics;
  }
}
assert.strictEqual(calls.metrics, wantsMetrics ? 1 : 0);
if (!wantsMetrics) {
  // A tracing-only registration must leave room for the application's SDK.
  metrics.setGlobalMeterProvider(applicationMeterProvider);
}
const expectedMeter = wantsMetrics && mode !== 'meter-conflict' ?
  meterProvider : applicationMeterProvider;
assert.strictEqual(metrics.getMeterProvider(), expectedMeter);
const meterRegistrations = calls.metrics;

// Later mutation of the caller's options must not change the chosen signals.
if (options !== undefined) {
  options.traces = !traces;
  options.metrics = !wantsMetrics;
}
if (mode !== 'preinstalled-instrumentation') {
  nsolid.otel.registerInstrumentations(instrumentation);
}
for (const next of [0, 1, 1, 0]) {
  flags = next;
  trace.nsolidTracer.emit('flagsUpdated', flags);
}
assert.strictEqual(calls.metrics, meterRegistrations);
assert.strictEqual(metrics.getMeterProvider(), expectedMeter);
if (!traces) {
  assert.strictEqual(calls.context, 0);
  assert.strictEqual(calls.trace, 0);
  assert.strictEqual(calls.contextDisable, 0);
  assert.strictEqual(calls.traceDisable, 0);
  assert.strictEqual(calls.enable, 0);
  assert.strictEqual(calls.disable, 0);
  assert.strictEqual(api.context.active(), contextMarker);
  assert.strictEqual(api.trace.getTracer('application'), tracerMarker);
} else if (traceConflict) {
  assert.strictEqual(calls.enable, 1);
  assert.strictEqual(calls.disable, 2);
  assert.strictEqual(calls.traceDisable, 0);
  assert.strictEqual(api.trace.getTracer('application'), tracerMarker);
  if (contextConflict) {
    assert.strictEqual(calls.contextDisable, 0);
    assert.strictEqual(api.context.active(), contextMarker);
  }
} else {
  assert.strictEqual(calls.context, mode === 'late' ? 1 : 2);
  assert.strictEqual(calls.trace, mode === 'late' ? 1 : 2);
  assert.strictEqual(calls.enable, mode === 'late' ? 1 : 2);
  assert.strictEqual(calls.disable, mode === 'late' ? 3 : 2);
}
assert.throws(() => nsolid.otel.register(externalApi), {
  code: 'ERR_NSOLID_OTEL_API_ALREADY_REGISTERED',
});
