// Flags: --expose-internals --no-warnings
'use strict';

// Tracing IDs are generated into one off-heap scratch buffer and handled as
// uint32 words. Check the views and the word <-> hex conversions.

require('../common');
const assert = require('assert');
const { readFileSync } = require('fs');
const { resolve } = require('path');
const { compileFunction } = require('vm');
const { internalBinding, primordials } = require('internal/test/binding');
const { arrayBufferViewHasBuffer } = internalBinding('util');

const traceModule = { exports: {} };
const source = readFileSync(resolve(__dirname,
                                    '../../lib/internal/otel/trace.js'), 'utf8');
compileFunction(`${source}\nmodule.exports = { spanIdView, traceIdView, ` +
                'idWords, encodeSpanId, encodeTraceId, parseTraceId };',
                ['require', 'internalBinding', 'primordials', 'module'])(
  require, () => ({}), primordials, traceModule);
const {
  spanIdView,
  traceIdView,
  idWords,
  encodeSpanId,
  encodeTraceId,
  parseTraceId,
} = traceModule.exports;

// The views the fast calls write into are off-heap and share the words.
for (const view of [spanIdView, traceIdView, idWords]) {
  assert(arrayBufferViewHasBuffer(view));
  assert.strictEqual(view.buffer, idWords.buffer);
}
assert.strictEqual(spanIdView.byteOffset, 0);
assert.strictEqual(spanIdView.length, 8);
assert.strictEqual(traceIdView.byteOffset, 8);
assert.strictEqual(traceIdView.length, 16);
assert.strictEqual(idWords.length, 8);

// The hex form is the words in order, zero-padded: the same as C++.
assert.strictEqual(encodeSpanId(0, 0), '0000000000000000');
assert.strictEqual(encodeSpanId(0x00000001, 0xabcdef01), '00000001abcdef01');
assert.strictEqual(encodeSpanId(0xffffffff, 0x80000000), 'ffffffff80000000');
assert.strictEqual(encodeTraceId([0x00000001, 0x0000abcd, 0xffffffff, 0]),
                   '000000010000abcdffffffff00000000');

for (let i = 0; i < 1000; i++) {
  const words = Array.from({ length: 4 },
                           () => Math.floor(Math.random() * 2 ** 32));
  const id = (BigInt(words[0]) << 32n) | BigInt(words[1]);
  assert.strictEqual(encodeSpanId(words[0], words[1]),
                     id.toString(16).padStart(16, '0'));
  const traceId = encodeTraceId(words);
  assert.match(traceId, /^[0-9a-f]{32}$/);
  assert.deepStrictEqual(parseTraceId(traceId), words);
}

// Only lowercase hex trace IDs are turned into words.
for (const traceId of ['0123456789ABCDEF0123456789abcdef',
                       '0123456789abcdef0123456789abcde',
                       '0123456789abcdef0123456789abcdefa',
                       '0123456789abcdef0123456789abcdeg',
                       '', undefined, null, 1]) {
  assert.strictEqual(parseTraceId(traceId), null);
}
