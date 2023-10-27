// Flags: --dns-result-order=ipv4first
'use strict';

// Test the Tracer.startSpan() with the context argument filled.
// In this case, there's a single trace with 2 span:
//
// initial_name
//     |-----> child
//

const common = require('../../common');
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
    },
    end_reason: binding.kSpanEndOk,
    name: 'initial_name',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kInternal,
    type: binding.kSpanCustom,
    status: {
      code: api.SpanStatusCode.UNSET,
    },
    children: [
      {
        attributes: {
          child_key: 'child_value',
        },
        end_reason: 0,
        events: [],
        name: 'child',
        thread_id: 0,
        type: 16,
      },
    ],
  },
];

checkTracesOnExit(binding, expectedTraces);

setupNSolid(common.mustCall(() => {
  if (!nsolid.otel.register(api)) {
    throw new Error('Error registering api');
  }

  const tracer = api.trace.getTracer('test');

  const span = tracer.startSpan('initial_name', { attributes: { a: 1, b: 2 } });
  let activeContext = api.context.active();
  activeContext = api.trace.setSpan(activeContext, span);
  const childSpan = tracer.startSpan('child', {}, activeContext);
  childSpan.setAttribute('child_key', 'child_value');
  childSpan.end();
  span.end();

  // Give a little time to reach out to the nsolid thread.
  setTimeout(() => {}, 100);
}));
