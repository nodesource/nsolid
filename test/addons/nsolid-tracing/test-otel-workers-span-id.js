'use strict';

const common = require('../../common');
const assert = require('assert');
const { Worker, isMainThread, parentPort, threadId } = require('worker_threads');
const fixtures = require('../../common/fixtures');
const nsolid = require('nsolid');
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixtures.fixturesDir] }));

function startSpan() {
  nsolid.setThreadName(`tracing-thread-${threadId}`);
  assert.strictEqual(nsolid.otel.register(api), true);
  const span = api.trace.getTracer('test').startSpan('overlapping span');
  const id = (BigInt(span.spanIdHigh) << 32n) | BigInt(span.spanIdLow);
  assert.strictEqual(id.toString(16).padStart(16, '0'),
                     span.spanContext().spanId);
  return span;
}

if (isMainThread) {
  const { setupNSolid } = require('./utils');
  const { checkTracesOnExit } = require('../../common/nsolid-traces');
  const binding = require(`./build/${common.buildType}/binding`);
  setupNSolid({ lookup: false }, common.mustCall(() => {
    const span = startSpan();
    const worker = new Worker(__filename);
    checkTracesOnExit(binding, [0, worker.threadId].map((threadId) => ({
      name: 'overlapping span',
      parentId: '0000000000000000',
      thread_id: threadId,
      attributes: { 'thread.name': `tracing-thread-${threadId}` },
      kind: binding.kInternal,
      type: binding.kSpanCustom,
      end_reason: binding.kSpanEndOk,
    })));
    worker.on('error', (err) => { throw err; });
    worker.on('exit', common.mustCall((code) => assert.strictEqual(code, 0)));
    worker.once('message', common.mustCall(() => {
      span.end();
      worker.postMessage('end');
    }));
  }));
} else {
  const span = startSpan();
  parentPort.once('message', common.mustCall(() => span.end()));
  parentPort.postMessage('started');
}
