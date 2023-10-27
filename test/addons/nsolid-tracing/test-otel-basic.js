// Flags: --dns-result-order=ipv4first
'use strict';

// Test the Tracer.startSpan() and Span interfaces with a single span.

const common = require('../../common');
const assert = require('assert');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const { fixturesDir } = require('../../common/fixtures');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const nsolid = require('nsolid');
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixturesDir] }));

const expectedTraces = [
  {
    attributes: {
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
    },
    events: [
      {
        name: 'my_event 1',
      },
      {
        attributes: {
          attr1: 'val1',
          attr2: 'val2',
        },
        name: 'my_event 2',
      },
      {
        attributes: {
          'exception.message': 'my_exception',
          'exception.type': 'Error',
        },
        name: 'exception',
      },
    ],
    end_reason: binding.kSpanEndOk,
    name: 'my name',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanCustom,
    status: {
      code: api.SpanStatusCode.OK,
    },
  },
];

checkTracesOnExit(binding, expectedTraces);

setupNSolid(common.mustCall(() => {
  if (!nsolid.otel.register(api)) {
    throw new Error('Error registering api');
  }

  const tracer = api.trace.getTracer('test');

  const span = tracer.startSpan('initial_name', { attributes: { a: 1, b: 2 },
                                                  kind: api.SpanKind.CLIENT });
  assert.strictEqual(span.updateName('my name'), span);
  assert.strictEqual(span.setAttributes({ c: 3, d: 4 }), span);
  assert.strictEqual(span.setAttribute('e', 5), span);
  assert.strictEqual(span.addEvent('my_event 1', Date.now()), span);
  assert.strictEqual(
    span.addEvent('my_event 2', { attr1: 'val1', attr2: 'val2' }, Date.now()),
    span);
  span.recordException(new Error('my_exception'));
  span.setStatus({ code: api.SpanStatusCode.OK });
  span.setStatus({ code: api.SpanStatusCode.ERROR, message: 'my_message' });
  span.end();

  // Give a little time to reach out to the nsolid thread.
  setTimeout(() => {}, 100);
}));
