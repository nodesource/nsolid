// Flags: --expose-internals --no-warnings --allow-natives-syntax
'use strict';

// pushSpanStart carries the span, trace and parent IDs as uint32 words. Check
// that C++ hex-encodes them (zero-padded, high word first) into the SpanStor,
// through both the fallback and the fast call.

const common = require('../../common');
const assert = require('assert');
const { internalBinding } = require('internal/test/binding');
const { setupNSolid } = require('./utils');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const addon = require(`./build/${common.buildType}/binding`);
const binding = internalBinding('nsolid_api');
const c = binding.nsolid_consts;

const traceWords = [0x00000001, 0x0000abcd, 0xffffffff, 0x80000000];
const traceId = '000000010000abcdffffffff80000000';
const root = [0x00000001, 0x00000002];
const child = [0x92345678, 0xabcdef01];

checkTracesOnExit(addon, [{
  name: 'root',
  spanId: '0000000100000002',
  traceId,
  parentId: '0000000000000000',
  type: addon.kSpanCustom,
  end_reason: addon.kSpanEndOk,
  children: [{
    name: 'child',
    spanId: '92345678abcdef01',
    traceId,
    parentId: '0000000100000002',
    type: addon.kSpanCustom,
    end_reason: addon.kSpanEndOk,
  }],
}]);

setupNSolid({ lookup: false }, common.mustCall(() => {
  // Off-heap, like the scratch buffer in lib/internal/otel/trace.js.
  const ids = new Uint32Array(new ArrayBuffer(32));
  function pushStart([high, low], [parentHigh, parentLow]) {
    ids.set([high, low, ...traceWords, parentHigh, parentLow]);
    const monotonic = performance.now();
    binding.pushSpanStart(ids, performance.timeOrigin + monotonic, monotonic);
  }

  function span(name, id, parent) {
    pushStart(id, parent);
    binding.pushSpanDataUint64(id[0], id[1], c.kSpanType, addon.kSpanCustom);
    binding.pushSpanDataString(id[0], id[1], c.kSpanName, name);
  }

  const getCount = common.isDebug ?
    internalBinding('debug').getV8FastApiCallCount : undefined;
  eval('%PrepareFunctionForOptimization(pushStart)');
  span('root', root, [0, 0]);
  const before = getCount?.('nsolid.pushSpanStart');
  eval('%OptimizeFunctionOnNextCall(pushStart)');
  span('child', child, root);
  if (getCount) {
    assert.strictEqual(getCount('nsolid.pushSpanStart'), before + 1);
  }

  for (const [high, low] of [child, root]) {
    binding.pushSpanDataDouble(high, low, c.kSpanEnd,
                               performance.timeOrigin + performance.now());
  }
}));
