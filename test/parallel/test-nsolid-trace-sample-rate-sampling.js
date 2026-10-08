// Flags: --expose-internals --no-warnings
'use strict';

const common = require('../common');
const assert = require('assert');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fixtures = require('../common/fixtures');
const { internalBinding } = require('internal/test/binding');

const binding = internalBinding('nsolid_api');
const nsolid = require('nsolid');
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixtures.fixturesDir] }));

function registerTracingApi() {
  binding.trace_flags[0] = binding.nsolid_consts.kSpanCustom;

  try {
    nsolid.otel.register(api);
  } catch {
    // Already registered in this thread.
  }
}

function countSampledRoots(iterations) {
  const tracer = api.trace.getTracer('trace-sample-rate');
  let sampled = 0;

  for (let i = 0; i < iterations; i++) {
    const span = tracer.startSpan('root');
    sampled += (span.spanContext().traceFlags & api.TraceFlags.SAMPLED) ? 1 : 0;
    span.end();
  }

  return sampled;
}

async function waitForSampleRate(expectedRate, retries = 200) {
  for (let i = 0; i < retries; i++) {
    if (binding.trace_sample_rate[0] === expectedRate) {
      return;
    }

    await new Promise((resolve) => setImmediate(resolve));
  }

  throw new Error(`Timed out waiting for trace_sample_rate=${expectedRate}, current=${binding.trace_sample_rate[0]}`);
}

function runWorker(iterations, expectedSampled) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(__filename, {
      workerData: { iterations },
    });

    worker.once('message', common.mustCall((sampled) => {
      if (settled) return;
      settled = true;
      assert.strictEqual(sampled,
                         expectedSampled,
                         `Expected worker sampled=${expectedSampled}, got ${sampled}`);
      resolve();
    }));

    worker.once('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    worker.once('exit', (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        reject(new Error('Worker exited without reporting sampling result'));
      } else {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

if (isMainThread) {
  (async () => {
    registerTracingApi();
    nsolid.enableTraces();
    assert.strictEqual(nsolid.config.tracingEnabled, true);

    nsolid.start({ traceSampleRate: 0.0 });
    await waitForSampleRate(0.0);
    assert.strictEqual(countSampledRoots(200), 0);

    nsolid.start({ traceSampleRate: 1.0 });
    await waitForSampleRate(1.0);
    assert.strictEqual(countSampledRoots(200), 200);

    nsolid.start({ traceSampleRate: 0.5 });
    await waitForSampleRate(0.5);
    const sampled = countSampledRoots(1000);
    assert.ok(sampled >= 400 && sampled <= 600,
              `Expected sampled roots in [400, 600], got ${sampled}`);

    nsolid.start({ traceSampleRate: 0.0 });
    await waitForSampleRate(0.0);
    await runWorker(200, 0);

    nsolid.start({ traceSampleRate: 1.0 });
    await waitForSampleRate(1.0);
    await runWorker(200, 200);
  })().catch((err) => {
    throw err;
  });
} else {
  registerTracingApi();
  const sampled = countSampledRoots(workerData.iterations);
  parentPort.postMessage(sampled);
}
