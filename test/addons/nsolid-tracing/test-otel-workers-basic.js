// Flags: --dns-result-order=ipv4first
'use strict';

// Test the Tracer.startSpan() and Span interfaces with a single span.

const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const { fixturesDir } = require('../../common/fixtures');
const { Worker, isMainThread, threadId } = require('worker_threads');

const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const nsolid = require('nsolid');
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixturesDir] }));

function test() {
  if (!nsolid.otel.register(api)) {
    throw new Error('Error registering api');
  }

  const tracer = api.trace.getTracer('test');

  const span = tracer.startSpan('initial_name', { attributes: { a: 1, b: 2 } });
  span.updateName('my name');
  span.setAttributes({ c: 3, d: 4 });
  span.setAttribute('e', 5);
  span.addEvent('my_event 1', Date.now());
  span.addEvent('my_event 2', { attr1: 'val1', attr2: 'val2' }, Date.now());
  span.end();

  // Give a little time to reach out to the nsolid thread.
  setTimeout(() => {}, 100);
}

const expectedTraces = [];
if (isMainThread) {
  setupNSolid(common.mustCall(() => {
    const w = new Worker(__filename);
    expectedTraces.push({
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
      ],
      end_reason: binding.kSpanEndOk,
      name: 'my name',
      parentId: '0000000000000000',
      thread_id: threadId,
      kind: binding.kInternal,
      type: binding.kSpanCustom,
    });

    expectedTraces.push({
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
      ],
      end_reason: binding.kSpanEndOk,
      name: 'my name',
      parentId: '0000000000000000',
      thread_id: w.threadId,
      kind: binding.kInternal,
      type: binding.kSpanCustom,
    });

    checkTracesOnExit(binding, expectedTraces);
    test();
  }));
} else {
  test();
}
