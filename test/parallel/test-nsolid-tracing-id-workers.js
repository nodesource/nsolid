// Flags: --expose-internals --allow-natives-syntax
'use strict';

const common = require('../common');
const assert = require('assert');
const { Worker, isMainThread, parentPort } = require('worker_threads');
const { internalBinding } = require('internal/test/binding');
const binding = internalBinding('nsolid_api');
const getCount = common.isDebug ?
  internalBinding('debug').getV8FastApiCallCount : undefined;

function generateIds() {
  const ids = [];
  for (const size of [8, 16]) {
    const buffer = new Uint8Array(size + 2).fill(0xa5);
    const output = buffer.subarray(1, size + 1);
    const generate = size === 8 ?
      () => binding.getSpanId(output) : () => binding.getTraceId(output);
    function record() {
      generate();
      assert.strictEqual(buffer[0], 0xa5);
      assert.strictEqual(buffer[size + 1], 0xa5);
      const id = Buffer.from(output).toString('hex');
      assert.notStrictEqual(id, '0'.repeat(size * 2));
      ids.push(id);
    }

    eval('%PrepareFunctionForOptimization(generate)');
    record();
    record();
    const key = size === 8 ? 'nsolid.getSpanId' : 'nsolid.getTraceId';
    const before = getCount?.(key);
    eval('%OptimizeFunctionOnNextCall(generate)');
    record();
    if (getCount) {
      assert.strictEqual(getCount(key), before + 1);
    }
    for (let i = 0; i < 2048; i++)
      record();
  }
  return ids;
}

if (isMainThread) {
  const ids = new Set();
  function check(values) {
    assert.strictEqual(values.length, 2 * (2048 + 3));
    for (const id of values) {
      assert(!ids.has(id), `Duplicate tracing ID: ${id}`);
      ids.add(id);
    }
  }

  for (let i = 0; i < 4; i++) {
    const worker = new Worker(__filename);
    worker.on('message', common.mustCall(check));
    worker.on('exit', common.mustCall((code) => assert.strictEqual(code, 0)));
  }
  check(generateIds());
} else {
  parentPort.postMessage(generateIds());
}
