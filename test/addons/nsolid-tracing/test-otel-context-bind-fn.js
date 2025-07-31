// Flags: --dns-result-order=ipv4first
'use strict';

// Basic test for ContextAPI.bind() on functions. At the moment just using the
// @opentelemetry/context-async-hooks implementation.
//
// In this case, there's a single trace with 2 span:
//
// initial_name
//     |-----> child
//

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
    },
    end_reason: binding.kSpanEndOk,
    name: 'initial_name',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kInternal,
    type: binding.kSpanCustom,
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
  // Get current active context
  let activeContext = api.context.active();
  // Set span to the context so it’s propagated
  activeContext = api.trace.setSpan(activeContext, span);
  activeContext = activeContext.setValue('my_key', 'my_value');

  const fn = () => {
    // All that runs from here has activeContext as active context
    setTimeout(() => {
      const ctxt = api.context.active();
      const childSpan = tracer.startSpan('child', {}, ctxt);
      assert.strictEqual(activeContext, ctxt);
      assert.strictEqual(ctxt.getValue('my_key'), 'my_value');
      const newContext = ctxt.deleteValue('my_key');
      assert.strictEqual(newContext.getValue('my_key'), undefined);
      childSpan.setAttribute('child_key', 'child_value');
      childSpan.end();
      span.end();
    }, 0);
  };

  const boundFn = api.context.bind(activeContext, fn);
  boundFn();

  // Give a little time to reach out to the nsolid thread.
  setTimeout(() => {}, 100);
}));
