'use strict';

const http = require('node:http');
const assert = require('node:assert');
const { parseArgs } = require('node:util');
const { pathToFileURL } = require('node:url');
const { isMainThread, parentPort, Worker, threadId } = require('node:worker_threads');
const nsolid = require('nsolid');
const { fixturesDir } = require('../fixtures');
let externalBatch;
let apiMetricsContract;

const options = {
  trace: {
    type: 'string',
    short: 't',
  },
  workers: {
    type: 'string',
    short: 'w',
  },
};
const args = parseArgs({ options });

const interval = setInterval(() => {
}, 100);

function execHttpTransaction() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello World\n');
  });

  server.listen(0, () => {
    const port = server.address().port;
    const req = http.request({
      host: '127.0.0.1',
      port,
      method: 'GET',
      path: '/',
    }, (res) => {
      res.on('data', () => {
      });
      res.on('end', () => {
        server.close();
      });
    });
    req.end();
  });
}

function execFetchTransaction() {
  const server = http.createServer((req, res) => {
    req.resume();
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Hello World\n');
    }, 10);
  });

  server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 25; i++) {
      const responses = await Promise.all(Array.from({ length: 32 }, () => {
        return fetch(url, {
          method: 'POST',
          body: 'payload',
        });
      }));

      await Promise.all(responses.map((response) => response.text()));
    }

    server.close();
  });
}

function execDnsTransaction() {
  const dns = require('node:dns');
  dns.lookup('example.org', () => {
    dns.lookupService('127.0.0.1', 22, () => {
      dns.resolve('example.org', () => {
      });
    });
  });
}

function execCustomTrace() {
  // Just to make sure the trace is recorded.
  setTimeout(() => {
    const api = require(require.resolve('@opentelemetry/api',
                                        { paths: [fixturesDir] }));
    try {
      nsolid.otel.register(api);
    } catch (err) {
      if (err.code !== 'ERR_NSOLID_OTEL_API_ALREADY_REGISTERED')
        throw err;
    }
    const tracer = api.trace.getTracer('test');
    const span = tracer.startSpan('initial_name', { attributes: { a: 1, b: 2 },
                                                    kind: api.SpanKind.CLIENT });
    span.setAttributes({ c: 3, d: 4 })
        .setAttribute('latin1', 'Espa\u00f1a')
        .setAttribute('e', [ 'abAD', 'cdCF'])
        .addEvent('my_event 1', Date.now())
        .addEvent('my_event 2', { attr1: 'val1', attr2: 'val2' }, Date.now());
    span.recordException(new Error('my_exception'));
    span.setStatus({ code: api.SpanStatusCode.ERROR, message: 'my_message' });
    span.end();
  }, 1000);
}

function registerApiMetrics() {
  const api = require(require.resolve('@opentelemetry/api',
                                      { paths: [fixturesDir] }));
  const metrics = require(require.resolve('@opentelemetry/api-metrics',
                                          { paths: [fixturesDir] })).metrics;
  let providerRegistrations = 0;
  const externalMetrics = {
    getMeterProvider: () => metrics.getMeterProvider(),
    setGlobalMeterProvider(provider) {
      providerRegistrations++;
      return metrics.setGlobalMeterProvider(provider);
    },
    getMeter: (...args) => metrics.getMeter(...args),
  };
  nsolid.otel.register({ ...api, metrics: externalMetrics });
  if (providerRegistrations !== 1) {
    throw new Error(`Meter provider registered ${providerRegistrations} times`);
  }
  if (metrics.getMeterProvider() !==
      nsolid.otel.api.metrics.getMeterProvider()) {
    throw new Error('N|Solid meter provider was not registered');
  }

  const meter = metrics.getMeter('external-api', '1.0', {
    schemaUrl: 'https://example.com/schema/metrics',
  });
  meter.createCounter('external-api-requests').add(3);
  const gauge = meter.createObservableGauge('external-batch-gauge');
  const counter = meter.createObservableCounter('external-batch-counter');
  const callback = (result) => {
    result.observe(gauge, 42, { source: 'batch' });
    result.observe(counter, 7, { source: 'batch' });
  };
  const observables = [gauge, counter];
  meter.addBatchObservableCallback(callback, observables);
  externalBatch = { meter, callback, observables };
}

function setupApiMetricsContract() {
  const provider = nsolid.otel.api.metrics;
  const schemaUrl = 'https://example.com/metrics/schema';
  const meter = provider.getMeter('api-contract', '1.0', { schemaUrl });
  const histogram = meter.createHistogram('latency', {
    unit: 'ms',
    description: 'Initial histogram metadata',
    advice: { explicitBucketBoundaries: [ 1, 5 ] },
  });
  const repeatedHistogram = meter.createHistogram('latency', {
    unit: 's',
    description: 'Ignored repeated metadata',
    advice: { explicitBucketBoundaries: [ 2, 4 ] },
  });
  assert.strictEqual(histogram, repeatedHistogram);
  histogram.record(2);
  repeatedHistogram.record(3);
  meter.createHistogram('empty-histogram');

  const cumulativeHistogram = meter.createHistogram('cumulative-histogram');
  cumulativeHistogram.record(1, { route: '/items' });
  cumulativeHistogram.record(2, { route: '/items' });
  const cardinalityHistogram = meter.createHistogram('histogram-cardinality');
  for (let id = 0; id <= 2000; id++) {
    cardinalityHistogram.record(1, { id });
  }
  cardinalityHistogram.record(5, { id: 0 });

  meter.createCounter('integer-value-type', { valueType: 0 }).add(3);
  const observedCounter = meter.createObservableCounter(
    'observed-counter-absolute');
  observedCounter.addCallback((result) =>
    result.observe(5, { source: 'same' }));
  observedCounter.addCallback((result) =>
    result.observe(7, { source: 'same' }));
  const overflowCounter = meter.createObservableCounter(
    'observable-cardinality');
  const overflowCallback = (result) => {
    for (let id = 0; id < 1999; id++) {
      result.observe(1, { id });
    }
    result.observe(5, { id: 1999 });
    result.observe(7, { id: 1999 });
    result.observe(1, { id: 2000 });
  };
  overflowCounter.addCallback(overflowCallback);
  const overflowUpDownCounter = meter.createObservableUpDownCounter(
    'observable-updown-cardinality');
  const overflowUpDownCallback = (result) => {
    for (let id = 0; id < 1999; id++) {
      result.observe(0, { id });
    }
    result.observe(-1e308, { id: 1999 });
    result.observe(1.5e308, { id: 2000 });
    result.observe(1e308, { id: 2001 });
    result.observe(-1.2e308, { id: 1999 });
  };
  overflowUpDownCounter.addCallback(overflowUpDownCallback);
  for (const [name, version, schema, value] of [
    [ 'api-contract', '1.0', schemaUrl, 1 ],
    [ 'api-contract', '2.0', schemaUrl, 2 ],
    [ 'api-contract', '1.0', 'https://example.com/other-schema', 3 ],
    [ 'other-api-contract', '1.0', schemaUrl, 4 ],
  ]) {
    provider.getMeter(name, version, { schemaUrl: schema })
      .createCounter('meter-identity').add(value);
  }

  const first = meter.createObservableGauge('batch-first');
  const second = meter.createObservableGauge('batch-second');
  const undeclared = meter.createObservableGauge('batch-undeclared');
  const neverDeclared = meter.createObservableGauge('batch-never-declared');
  const batchRuns = meter.createObservableGauge('batch-callback-runs');
  let batchInvocationCount = 0;
  const batchCallback = (result) => {
    batchInvocationCount++;
    result.observe(first, 11, { source: 'first' });
    result.observe(second, 12, { source: 'shared' });
    result.observe(undeclared, 13, { source: 'second' });
    result.observe(neverDeclared, 14);
    result.observe({}, 16);
    result.observe(batchRuns, batchInvocationCount);
  };
  const firstSet = [ first, second, batchRuns, first ];
  const reorderedFirstSet = [ batchRuns, second, first ];
  const secondSet = [ second, undeclared, batchRuns ];
  meter.addBatchObservableCallback(batchCallback, firstSet);
  meter.addBatchObservableCallback(batchCallback, reorderedFirstSet);
  meter.addBatchObservableCallback(batchCallback, secondSet);

  apiMetricsContract = {
    meter,
    batchCallback,
    firstSet,
    reorderedFirstSet,
    second,
    undeclared,
    overflowCounter,
    overflowCallback,
    overflowUpDownCounter,
    overflowUpDownCallback,
  };
}

function startApiMetricsContractAsyncCallbacks() {
  const { meter } = apiMetricsContract;
  const gauge = meter.createObservableGauge('async-completion');
  const batchGauge = meter.createObservableGauge('async-batch-completion');
  const firstPromise = new Promise((resolve) => {
    apiMetricsContract.resolveFirst = resolve;
  });
  const secondPromise = new Promise((resolve) => {
    apiMetricsContract.resolveSecond = resolve;
  });
  const batchPromise = new Promise((resolve) => {
    apiMetricsContract.resolveBatch = resolve;
  });
  let firstStarted = false;
  let secondStarted = false;
  let batchStarted = false;
  gauge.addCallback(async (result) => {
    if (!firstStarted) {
      firstStarted = true;
      process.send({ type: 'api_metrics_async_first_started' });
    }
    await firstPromise;
    result.observe(41, { callback: 'first' });
  });
  gauge.addCallback(async (result) => {
    if (!secondStarted) {
      secondStarted = true;
      process.send({ type: 'api_metrics_async_second_started' });
    }
    await secondPromise;
    result.observe(42, { callback: 'second' });
  });
  const batchCallback = async (result) => {
    if (!batchStarted) {
      batchStarted = true;
      process.send({ type: 'api_metrics_async_batch_started' });
    }
    await batchPromise;
    result.observe(batchGauge, 43, { callback: 'batch' });
  };
  meter.addBatchObservableCallback(batchCallback, [ batchGauge ]);
  apiMetricsContract.gauge = gauge;
}

function startApiMetricsContractDisableCallback() {
  const gauge = apiMetricsContract.meter
    .createObservableGauge('disable-completion');
  const promise = new Promise((resolve) => {
    apiMetricsContract.resolveDisable = resolve;
  });
  gauge.addCallback(async (result) => {
    process.send({ type: 'api_metrics_disable_callback_started' });
    await promise;
    result.observe(44);
  });
}

function blockFor(duration) {
  const start = Date.now();
  while (Date.now() - start < duration);
}

async function handleImport(msg) {
  const { url } = msg;
  const { blockFor } = await import(pathToFileURL(url));
  blockFor(500);
}

function handleTrace(msg) {
  if (msg.type === 'trace') {
    switch (msg.kind) {
      case 'http':
        execHttpTransaction();
        break;
      case 'fetch':
        execFetchTransaction();
        break;
      case 'dns':
        execDnsTransaction();
        break;
      case 'custom':
        execCustomTrace();
        break;
    }
  }
}

if (isMainThread) {
  const workers = new Map();
  let observableCallbacks;
  let allObservableCallbacks;
  process.on('message', (msg) => {
    if (msg.type === 'block') {
      if (threadId === msg.threadId) {
        blockFor(msg.duration);
      } else {
        const worker = workers.get(msg.threadId);
        const onBlock = (response) => {
          if (response.type === 'block_started') {
            process.send(response);
          } else if (response.type === 'block_finished') {
            worker.off('message', onBlock);
            process.send(response);
          }
        };
        worker.on('message', onBlock);
        worker.postMessage(msg);
      }
    } else if (msg.type === 'config') {
      if (msg.config) {
        nsolid.start(msg.config);
      }

      process.send({ type: 'config', config: nsolid.config });
    } else if (msg.type === 'enable_assets') {
      nsolid.enableAssets();
      process.send({ type: 'enable_assets' });
    } else if (msg.type === 'disable_assets') {
      nsolid.disableAssets();
      process.send({ type: 'disable_assets' });
    } else if (msg.type === 'enable_traces' || msg.type === 'disable_traces') {
      const enabled = msg.type === 'enable_traces';
      const { getTraceFlags, nsolidTracer } = require('internal/nsolid_trace');
      if (enabled) {
        nsolid.enableTraces();
      } else {
        nsolid.disableTraces();
      }

      // Wait for the tracing thread to apply the configuration.
      const onFlagsUpdated = () => {
        if (!!getTraceFlags() !== enabled)
          return;
        nsolidTracer.removeListener('flagsUpdated', onFlagsUpdated);
        process.send({ type: msg.type });
      };
      nsolidTracer.on('flagsUpdated', onFlagsUpdated);
      onFlagsUpdated();
    } else if (msg.type === 'heap_profile') {
      nsolid.heapProfile(msg.duration);
    } else if (msg.type === 'heap_sampling') {
      nsolid.heapSampling(msg.duration);
    } else if (msg.type === 'id') {
      process.send({ type: 'id', id: nsolid.id });
    } else if (msg.type === 'info') {
      process.send({ type: 'info', info: nsolid.info() });
    } else if (msg.type === 'import') {
      console.log(msg);
      if (threadId === msg.threadId) {
        handleImport(msg).then(() => {
          process.send(msg);
        });
      } else {
        const worker = workers.get(msg.threadId);
        worker.on('message', (msg) => {
          process.send(msg);
        });

        worker.postMessage(msg);
      }
    } else if (msg.type === 'log') {
      if (threadId === msg.threadId) {
        nsolid.logger[msg.level](msg.message);
      } else {
        workers.get(msg.threadId).postMessage(msg);
      }

      process.send({ type: 'log' });
    } else if (msg.type === 'metrics') {
      process.send({ type: 'metrics', metrics: nsolid.metrics() });
    } else if (msg.type === 'counter') {
      const meter = nsolid.otel.api.metrics.getMeter('test', '1.0');
      const counter = meter.createCounter(msg.name, {
        unit: 'By',
        description: 'Bytes sent',
      });
      const repeatedCounter = meter.createCounter(msg.name, {
        unit: 'By',
        description: 'Bytes sent',
      });
      counter.add(2, {
        status: 200,
        route: '/api/users',
        stages: [ 'received', 'stored' ],
        flags: [ true, false ],
        values: [ 1, 2 ],
      });
      repeatedCounter.add(3, {
        status: 200,
        route: '/api/users',
        stages: [ 'received', 'stored' ],
        flags: [ true, false ],
        values: [ 1, 2 ],
      });
      counter.add(7, {
        status: 500,
        route: '/api/users',
        stages: [ 'received', 'stored' ],
        flags: [ true, false ],
        values: [ 1, 2 ],
      });
      nsolid.otel.api.metrics.getMeter('other', '1.0')
        .createCounter(msg.name).add(7);
      meter.createCounter('worker-requests', {
        unit: 'By',
        description: 'Bytes sent',
      }).add(4, { 'thread.id': threadId });
      meter.createCounter('shared-worker-requests').add(4);
      meter.createUpDownCounter('shared-worker-active').add(-4);
      meter.createGauge('shared-worker-gauge').record(4);
      meter.createCounter('shared-worker-overflow').add(Number.MAX_VALUE);
      meter.createHistogram('shared-worker-duration').record(2);
      meter.createHistogram('shared-worker-overflow-histogram')
        .record(Number.MAX_VALUE);
      meter.createHistogram('shared-worker-boundary-conflict', {
        advice: { explicitBucketBoundaries: [ 1, 5 ] },
      }).record(2);
      const histogram = meter.createHistogram('request-duration', {
        unit: 'ms',
        description: 'Request duration',
      });
      histogram.record(0, { route: '/api/users' });
      histogram.record(-1e-300, { route: '/api/users' });
      histogram.record(1e-300, { route: '/api/users' });
      histogram.record(1e300, { route: '/api/users' });
      meter.createHistogram('zero-histogram').record(0);
      const statusHistogram = meter.createHistogram('histogram-status');
      statusHistogram.record(3, { status: 200 });
      statusHistogram.record(8, { status: 500 });
      const validationHistogram = meter.createHistogram('validation-histogram');
      validationHistogram.record(Number.MAX_VALUE);
      assert.throws(() => validationHistogram.record(Number.MAX_VALUE),
                    { name: 'TypeError' });
      assert.throws(() => validationHistogram.record(Infinity),
                    { name: 'TypeError' });
      assert.throws(() => validationHistogram.record(NaN),
                    { name: 'TypeError' });
      const advisedHistogram = meter.createHistogram('advised-histogram', {
        advice: { explicitBucketBoundaries: [ 0.1, 1, 10 ] },
      });
      assert.throws(() => meter.createHistogram('invalid-histogram', {
        advice: { explicitBucketBoundaries: [ 1, 1 ] },
      }), { name: 'TypeError' });
      advisedHistogram.record(0.05);
      advisedHistogram.record(0.1);
      advisedHistogram.record(0.2);
      advisedHistogram.record(10);
      advisedHistogram.record(11);
      validationHistogram.record(-Number.MAX_VALUE);
      const upDownCounter = meter.createUpDownCounter('active-requests');
      upDownCounter.add(3);
      upDownCounter.add(-1);
      allObservableCallbacks = [];
      const addObservableCallback = (instrument, callback) => {
        instrument.addCallback(callback);
        allObservableCallbacks.push([instrument, callback]);
      };
      const observedRequests = meter.createObservableCounter(
        'observed-requests');
      addObservableCallback(observedRequests,
                            (result) => result.observe(11, {
                              source: 'callback',
                            }));
      const observedTemperature = meter.createObservableGauge(
        'observed-temperature', {
          unit: 'Cel',
        });
      addObservableCallback(observedTemperature,
                            (result) => result.observe(-2, {
                              source: 'callback',
                            }));
      const observedConnections = meter.createObservableUpDownCounter(
        'observed-connections');
      addObservableCallback(observedConnections,
                            (result) => result.observe(-3, {
                              source: 'callback',
                            }));
      const observedRuntimeHeap = meter.createObservableGauge(
        'observed-runtime-heap');
      addObservableCallback(observedRuntimeHeap, (result) => {
        result.observe(nsolid.metrics().heapUsed,
                       { source: 'nsolid.metrics' });
      });
      const observedAsyncValue = meter.createObservableGauge(
        'observed-async-value');
      addObservableCallback(observedAsyncValue, async (result) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        result.observe(42, { source: 'delayed' });
      });
      const asyncFailures =
        meter.createObservableGauge('observed-async-failure');
      addObservableCallback(asyncFailures, async () => {
        await Promise.resolve();
        throw new Error('expected async observable callback error');
      });
      addObservableCallback(asyncFailures, async (result) => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        result.observe(99, { source: 'after-rejection' });
      });
      const multipleCallbacks = meter.createObservableGauge(
        'observed-multiple-callbacks');
      const callbackThrows = () => {
        throw new Error('expected observable callback error');
      };
      const callbackA = (result) => result.observe(1, { callback: 'a' });
      const callbackB = (result) => result.observe(2, { callback: 'b' });
      addObservableCallback(multipleCallbacks, callbackThrows);
      addObservableCallback(multipleCallbacks, callbackA);
      addObservableCallback(multipleCallbacks, callbackB);
      observableCallbacks = { instrument: multipleCallbacks, callbackThrows,
                              callbackA, callbackB };
      const cardinality = meter.createCounter('cardinality');
      for (let id = 0; id < 2001; id++) {
        cardinality.add(1, { id });
      }
      cardinality.add(5, { id: 0 });
      const normalized = meter.createCounter('normalized');
      normalized.add(2, { first: 'value', second: true });
      normalized.add(3, { second: true, first: 'value' });
      const threadAttributes = meter.createCounter('thread-attributes');
      threadAttributes.add(2, { 'thread.id': 123, 'thread.name': 'first' });
      threadAttributes.add(3, { 'thread.id': 456, 'thread.name': 'second' });
      process.send({ type: 'counter' });
    } else if (msg.type === 'register_api_metrics') {
      registerApiMetrics();
      process.send({ type: 'register_api_metrics' });
    } else if (msg.type === 'api_metrics_contract_setup') {
      setupApiMetricsContract();
      process.send({ type: 'api_metrics_contract_ready' });
    } else if (msg.type === 'api_metrics_contract_remove_cardinality') {
      const { overflowCounter, overflowCallback,
              overflowUpDownCounter, overflowUpDownCallback } = apiMetricsContract;
      overflowCounter.removeCallback(overflowCallback);
      overflowUpDownCounter.removeCallback(overflowUpDownCallback);
      process.send({ type: 'api_metrics_contract_cardinality_removed' });
    } else if (msg.type === 'api_metrics_contract_update_histogram') {
      apiMetricsContract.meter.createHistogram('cumulative-histogram')
        .record(4, { route: '/items' });
      process.send({ type: 'api_metrics_contract_histogram_updated' });
    } else if (msg.type === 'api_metrics_contract_remove_batch') {
      const { meter, batchCallback, reorderedFirstSet } = apiMetricsContract;
      meter.removeBatchObservableCallback(batchCallback, reorderedFirstSet);
      process.send({ type: 'api_metrics_contract_batch_removed' });
    } else if (msg.type === 'api_metrics_contract_start_async') {
      startApiMetricsContractAsyncCallbacks();
      process.send({ type: 'api_metrics_contract_async_registered' });
    } else if (msg.type === 'api_metrics_contract_release_first') {
      apiMetricsContract.resolveFirst();
      process.send({ type: 'api_metrics_contract_first_released' });
    } else if (msg.type === 'api_metrics_contract_disable_release_second') {
      apiMetricsContract.resolveSecond();
      process.send({ type: 'api_metrics_contract_second_released' });
    } else if (msg.type === 'api_metrics_contract_release_batch') {
      apiMetricsContract.resolveBatch();
      process.send({ type: 'api_metrics_contract_batch_released' });
    } else if (msg.type === 'api_metrics_contract_start_disable') {
      startApiMetricsContractDisableCallback();
      process.send({ type: 'api_metrics_contract_disable_registered' });
    } else if (msg.type === 'api_metrics_contract_disable_release') {
      nsolid.otel.api.metrics.disable();
      apiMetricsContract.resolveDisable();
      process.send({ type: 'api_metrics_contract_disabled' });
    } else if (msg.type === 'remove_observable_callback') {
      if (msg.name === 'all') {
        for (const [instrument, callback] of allObservableCallbacks) {
          instrument.removeCallback(callback);
        }
        if (externalBatch) {
          externalBatch.meter.removeBatchObservableCallback(
            externalBatch.callback,
            externalBatch.observables);
        }
        process.send({ type: 'remove_observable_callback' });
        return;
      }
      const callbacks = {
        throwing: observableCallbacks.callbackThrows,
        a: observableCallbacks.callbackA,
        b: observableCallbacks.callbackB,
      };
      const callback = callbacks[msg.name];
      observableCallbacks.instrument.removeCallback(callback);
      process.send({ type: 'remove_observable_callback' });
    } else if (msg.type === 'unsupported_metrics') {
      const meter = nsolid.otel.api.metrics.getMeter('test');
      const calls = [
        () => meter.addBatchObservableCallback(() => {}, []),
        () => meter.removeBatchObservableCallback(() => {}, []),
      ];
      const errors = calls.map((call) => {
        try {
          call();
          return null;
        } catch (err) {
          return err.message;
        }
      });
      process.send({ type: 'unsupported_metrics', errors });
    } else if (msg.type === 'validate_metrics') {
      const meter = nsolid.otel.api.metrics.getMeter('validation', '1.0');
      const counter = meter.createCounter('valid-updates');
      const errors = [
        () => counter.add(-1),
        () => counter.add(NaN),
        () => counter.add(Infinity),
        () => counter.add(-Infinity),
        () => counter.add(1, { invalid: null }),
      ].map((update) => {
        try {
          update();
          return false;
        } catch {
          return true;
        }
      });
      counter.add(10);
      counter.add(5);

      const gauge = meter.createGauge('temperature', {
        unit: 'Cel',
        description: 'Temperature',
      });
      gauge.record(10, { location: 'inside' });
      meter.createGauge('temperature').record(-5, { location: 'inside' });
      gauge.record(0, { location: 'outside' });
      for (const value of [ NaN, Infinity, -Infinity ]) {
        try {
          gauge.record(value, { location: 'inside' });
          errors.push(false);
        } catch {
          errors.push(true);
        }
      }

      const cumulative = meter.createCounter('cumulative-overflow');
      cumulative.add(Number.MAX_VALUE);
      try {
        cumulative.add(Number.MAX_VALUE);
        errors.push(false);
      } catch {
        errors.push(true);
      }
      process.send({ type: 'validate_metrics', errors });
    } else if (msg.type === 'disable_metrics') {
      const metrics = nsolid.otel.api.metrics;
      const originalProvider = metrics.getMeterProvider();
      const provider = {
        getMeter(...args) {
          return originalProvider.getMeter(...args);
        },
      };
      assert.strictEqual(metrics.setGlobalMeterProvider(provider), true);
      assert.strictEqual(metrics.setGlobalMeterProvider(provider), false);
      assert.strictEqual(metrics.getMeterProvider(), provider);

      const counter = metrics
        .getMeter('test', '1.0').createCounter('requests');
      counter.add(1, { status: 200 });
      const gauge = metrics.getMeter('test', '1.0')
        .createGauge('temperature');
      gauge.record(10);
      metrics.disable();
      assert.notStrictEqual(metrics.getMeterProvider(), provider);
      assert.strictEqual(metrics.setGlobalMeterProvider(provider), true);
      assert.strictEqual(metrics.setGlobalMeterProvider(provider), false);
      gauge.record(20);
      metrics.getMeter('after-disable')
        .createGauge('temperature').record(30);
      counter.add(2, { status: 200 });
      metrics.getMeter('after-disable')
        .createCounter('requests').add(3);
      metrics.disable();
      assert.notStrictEqual(metrics.getMeterProvider(), provider);
      process.send({ type: 'disable_metrics' });
    } else if (msg.type === 'profile') {
      nsolid.profile(msg.duration);
    } else if (msg.type === 'shutdown') {
      clearInterval(interval);
      if (!msg.error) {
        process.exit(msg.code || 0);
      } else {
        throw new Error('error');
      }
    } else if (msg.type === 'snapshot') {
      nsolid.snapshot();
    } else if (msg.type === 'startupTimes') {
      process.recordStartupTime(msg.name);
      process.send(msg);
    } else if (msg.type === 'threadName') {
      if (threadId === msg.threadId) {
        nsolid.setThreadName(msg.name);
        process.send(msg);
      } else {
        const worker = workers.get(msg.threadId);
        worker.once('message', (msg) => {
          process.send(msg);
        });
        worker.postMessage(msg);
      }
    } else if (msg.type === 'trace') {
      if (threadId === msg.threadId) {
        handleTrace(msg);
      } else {
        workers.get(msg.threadId).postMessage(msg);
      }
    } else if (msg.type === 'workers') {
      process.send({ type: 'workers', ids: Array.from(workers.keys()) });
    } else if (msg.type === 'worker_counter') {
      const worker = workers.get(msg.threadId);
      worker.once('message', (response) => {
        if (response.type === 'worker_counter') {
          process.send(response);
        }
      });
      worker.postMessage({ type: 'worker_counter', value: msg.value });
    } else if (msg.type === 'worker_disable_metrics') {
      const worker = workers.get(msg.threadId);
      worker.once('message', (response) => {
        if (response.type === 'worker_disable_metrics') {
          process.send(response);
        }
      });
      worker.postMessage({ type: 'worker_disable_metrics' });
    } else if (msg.type === 'worker_terminate') {
      const worker = workers.get(msg.threadId);
      worker.terminate().then(() => {
        workers.delete(msg.threadId);
        process.send({ type: 'worker_terminate' });
      });
    }
  });

  if (args.values.workers) {
    const NUM_WORKERS = parseInt(args.values.workers, 10);
    if (!Number.isNaN(NUM_WORKERS)) {
      for (let i = 0; i < NUM_WORKERS; i++) {
        const worker = new Worker(__filename);
        workers.set(worker.threadId, worker);
      }
    }
  }

  if (args.values.trace) {
    const trace = args.values.trace;
    if (trace === 'http') {
      // TODO(santigimeno): ideally we should be able to collect traces
      // immediately without the need of calling nsolid.start()
      nsolid.start();
      execHttpTransaction();
    } else if (trace === 'fetch') {
      // TODO(santigimeno): ideally we should be able to collect traces
      // immediately without the need of calling nsolid.start()
      nsolid.start();
      execFetchTransaction();
    } else if (trace === 'dns') {
      execDnsTransaction();
    } else if (trace === 'custom') {
      execCustomTrace();
    }
  }
} else {
  let observableCollectionCount = 0;
  let overflowMetricsRecorded = false;
  const observeSharedRequests = (result) =>
    result.observe(3, { source: 'callback' });
  const observeSharedConnections = (result) =>
    result.observe(2, { source: 'callback' });
  const observeSharedTemperature = (result) =>
    result.observe(-5, { source: 'callback' });
  const observeCollectionCount = (result) =>
    result.observe(++observableCollectionCount);
  parentPort.on('message', (msg) => {
    console.log('message', msg);
    switch (msg.type) {
      case 'block':
        parentPort.postMessage({
          type: 'block_started',
          threadId,
          callbackCount: observableCollectionCount,
        });
        blockFor(msg.duration);
        setTimeout(() => {
          parentPort.postMessage({
            type: 'block_finished',
            threadId,
            callbackCount: observableCollectionCount,
          });
        }, 100);
        break;
      case 'import':
        handleImport(msg).then(() => {
          parentPort.postMessage(msg);
        });
        break;
      case 'log':
        nsolid.logger[msg.level](msg.message);
        break;
      case 'threadName':
        nsolid.setThreadName(msg.name);
        parentPort.postMessage(msg);
        break;
      case 'trace':
        handleTrace(msg);
        break;
      case 'worker_counter': {
        const meter = nsolid.otel.api.metrics.getMeter('test', '1.0');
        meter.createObservableCounter('observed-requests')
          .addCallback(observeSharedRequests);
        meter.createObservableUpDownCounter('observed-connections')
          .addCallback(observeSharedConnections);
        meter.createObservableGauge('observed-temperature', { unit: 'Cel' })
          .addCallback(observeSharedTemperature);
        meter.createObservableGauge('worker-observable-collection-count')
          .addCallback(observeCollectionCount);
        meter
          .createCounter('worker-requests', {
            unit: 'By',
            description: 'Bytes sent',
          }).add(msg.value ?? 6, { 'thread.id': threadId });
        meter.createCounter('shared-worker-requests').add(msg.value ?? 6);
        meter.createUpDownCounter('shared-worker-active').add(-(msg.value ?? 6));
        meter.createGauge('shared-worker-gauge').record(msg.value ?? 6);
        meter.createHistogram('shared-worker-duration')
          .record(msg.value ?? 6);
        if (!overflowMetricsRecorded) {
          meter.createCounter('shared-worker-overflow')
            .add(Number.MAX_VALUE);
          meter.createHistogram('shared-worker-overflow-histogram')
            .record(Number.MAX_VALUE);
          overflowMetricsRecorded = true;
        }
        meter.createHistogram('shared-worker-boundary-conflict')
          .record(6);
        meter.createGauge('worker-exit-gauge').record(msg.value ?? 6);
        parentPort.postMessage({ type: 'worker_counter' });
        break;
      }
      case 'worker_disable_metrics':
        nsolid.otel.api.metrics.disable();
        parentPort.postMessage({ type: 'worker_disable_metrics' });
        break;
    }
  });
}
