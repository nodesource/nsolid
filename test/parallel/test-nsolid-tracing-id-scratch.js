// Flags: --expose-internals --no-warnings
'use strict';

const common = require('../common');
const assert = require('assert');
const { readFileSync } = require('fs');
const { resolve } = require('path');
const { compileFunction } = require('vm');
const { internalBinding, primordials } = require('internal/test/binding');
const { arrayBufferViewHasBuffer } = internalBinding('util');

let spanView;
let traceView;
let value = 0;
const binding = {
  getSpanId: common.mustCall((output) => {
    assert(arrayBufferViewHasBuffer(output));
    spanView ||= output;
    assert.strictEqual(output, spanView);
    assert.strictEqual(output.length, 8);
    output.fill(++value);
  }, 2),
  getTraceId: common.mustCall((output) => {
    assert(arrayBufferViewHasBuffer(output));
    traceView ||= output;
    assert.strictEqual(output, traceView);
    assert.strictEqual(output.length, 16);
    output.fill(++value);
  }, 2),
};

const traceModule = { exports: {} };
const source = readFileSync(resolve(__dirname,
                                    '../../lib/internal/otel/trace.js'), 'utf8');
compileFunction(`${source}\nmodule.exports = { getSpanId, getTraceId };`,
                ['require', 'internalBinding', 'primordials', 'module'])(
  require, () => binding, primordials, traceModule);
const { getSpanId, getTraceId } = traceModule.exports;
const originalFrom = Buffer.from;
Buffer.from = common.mustNotCall('ID copies must not invoke public Buffer.from');
try {
  const spanId = getSpanId();
  const traceId = getTraceId();
  assert(Buffer.isBuffer(spanId));
  assert.strictEqual(spanView.buffer, traceView.buffer);
  assert.strictEqual(getSpanId().toString('hex'), '03'.repeat(8));
  assert.strictEqual(getTraceId(), '04'.repeat(16));
  assert.strictEqual(spanId.toString('hex'), '01'.repeat(8));
  assert.strictEqual(traceId, '02'.repeat(16));
} finally {
  Buffer.from = originalFrom;
}
