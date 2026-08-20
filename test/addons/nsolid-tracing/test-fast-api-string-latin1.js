// Flags: --expose-internals --no-warnings --allow-natives-syntax
'use strict';

const common = require('../../common');
const assert = require('assert');
const { internalBinding } = require('internal/test/binding');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const fixtures = require('../../common/fixtures');
const addonBindingPath = require.resolve(`./build/${common.buildType}/binding`);
const addonBinding = require(addonBindingPath);

const nsolidBinding = internalBinding('nsolid_api');
const { nsolid_consts } = nsolidBinding;
const nsolid = require('nsolid');
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixtures.fixturesDir] }));

const expectedTraces = [
  {
    attributes: {
      'http.url': 'http://localhost/ma\u00f1ana',
    },
    end_reason: addonBinding.kSpanEndOk,
    name: 'Espa\u00f1a',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: addonBinding.kClient,
    type: addonBinding.kSpanCustom,
    status: {
      code: api.SpanStatusCode.OK,
    },
  },
];

checkTracesOnExit(addonBinding, expectedTraces);

setupNSolid({ lookup: false }, common.mustCall(() => {
  if (!nsolid.otel.register(api)) {
    throw new Error('Error registering api');
  }

  const tracer = api.trace.getTracer('test');
  const span = tracer.startSpan('initial_name', { kind: api.SpanKind.CLIENT });

  function pushSpanName() {
    nsolidBinding.pushSpanDataString(span.internalId,
                                     nsolid_consts.kSpanName,
                                     'Espa\u00f1a');
  }

  function pushSpanUrl() {
    nsolidBinding.pushSpanDataString3(span.internalId,
                                      nsolid_consts.kSpanHttpReqUrl,
                                      'http:',
                                      'localhost',
                                      '/ma\u00f1ana');
  }

  if (common.isDebug) {
    const { getV8FastApiCallCount } = internalBinding('debug');
    assert.strictEqual(getV8FastApiCallCount('nsolid.pushSpanDataString'), 0);
    assert.strictEqual(getV8FastApiCallCount('nsolid.pushSpanDataString3'), 0);

    eval('%PrepareFunctionForOptimization(pushSpanName)');
    pushSpanName();
    eval('%PrepareFunctionForOptimization(pushSpanUrl)');
    pushSpanUrl();

    assert.strictEqual(getV8FastApiCallCount('nsolid.pushSpanDataString'), 0);
    assert.strictEqual(getV8FastApiCallCount('nsolid.pushSpanDataString3'), 0);

    eval('%OptimizeFunctionOnNextCall(pushSpanName)');
    pushSpanName();
    eval('%OptimizeFunctionOnNextCall(pushSpanUrl)');
    pushSpanUrl();

    assert.strictEqual(getV8FastApiCallCount('nsolid.pushSpanDataString'), 1);
    assert.strictEqual(getV8FastApiCallCount('nsolid.pushSpanDataString3'), 1);
  } else {
    pushSpanName();
    pushSpanUrl();
  }

  span.setStatus({ code: api.SpanStatusCode.OK });
  span.end();

  setTimeout(() => {}, 100);
}));
