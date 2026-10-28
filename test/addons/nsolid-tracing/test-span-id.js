// Flags: --expose-internals --no-warnings --allow-natives-syntax
'use strict';

const common = require('../../common');
const assert = require('assert');
const { internalBinding } = require('internal/test/binding');
const { setupNSolid } = require('./utils');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const addon = require(`./build/${common.buildType}/binding`);
const binding = internalBinding('nsolid_api');
const c = binding.nsolid_consts;
const low = 0xabcdef01;
const highs = [0x92345678, 0x87654321];
const traceIds = ['12345678901234567890123456789012',
                  '87654321876543218765432187654321'];

checkTracesOnExit(addon, highs.map((high, i) => ({
  name: 'span',
  spanId: high.toString(16) + low.toString(16),
  traceId: traceIds[i],
  parentId: '0000000000000000',
  thread_id: 0,
  type: addon.kSpanCustom,
  end_reason: addon.kSpanEndOk,
  attributes: { 'http.url': 'http://localhost/', 'http.status_code': 200 },
})));

setupNSolid({ lookup: false }, common.mustCall(() => {
  function pushStart(high) {
    binding.pushSpanDataDouble(high, low, c.kSpanStart, performance.now());
  }

  function pushType(high) {
    binding.pushSpanDataUint64(high, low, c.kSpanType, addon.kSpanCustom);
  }

  function pushName(high) {
    binding.pushSpanDataString(high, low, c.kSpanName, 'span');
  }

  function pushUrl(high) {
    binding.pushSpanDataString3(high, low, c.kSpanHttpReqUrl,
                                'http:', 'localhost', '/');
  }

  // Exercise both the fallback and optimized numeric and string bindings.
  const functions = [pushStart, pushType, pushName, pushUrl];
  const names = ['Double', 'Uint64', 'String', 'String3'];
  for (const fn of functions) {
    eval('%PrepareFunctionForOptimization(fn)');
    fn(highs[0]);
  }
  for (let i = 0; i < functions.length; i++) {
    const fn = functions[i];
    const getCount = common.isDebug ?
      internalBinding('debug').getV8FastApiCallCount : undefined;
    const name = `nsolid.pushSpanData${names[i]}`;
    const before = getCount?.(name);
    eval('%OptimizeFunctionOnNextCall(fn)');
    fn(highs[1]);
    if (getCount) assert.strictEqual(getCount(name), before + 1);
  }

  for (let i = 0; i < highs.length; i++) {
    const high = highs[i];
    binding.pushSpanDataString(high, low, c.kSpanSpanId,
                               high.toString(16) + low.toString(16));
    binding.pushSpanDataString(high, low, c.kSpanTraceId, traceIds[i]);
    binding.pushSpanDataUint64(high, low, c.kSpanHttpStatusCode, 200);
    binding.pushSpanDataDouble(high, low, c.kSpanEnd, performance.now());
  }
}));
