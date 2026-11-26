// Flags: --expose-internals
'use strict';

const common = require('../../common');
const assert = require('assert');
const { EventEmitter } = require('events');
const { contextManager } = require('internal/otel/context');
const fixtures = require('../../common/fixtures');
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixtures.fixturesDir] }));

assert.ok(api.context.setGlobalContextManager(contextManager));
const context = api.ROOT_CONTEXT.setValue('test', 'once');
for (const method of ['once', 'prependOnceListener']) {
  const ee = api.context.bind(context, new EventEmitter());
  const listener = common.mustCall(function(value) {
    assert.strictEqual(this, ee);
    assert.strictEqual(value, 42);
    assert.strictEqual(api.context.active(), context);
  });
  ee[method]('x', listener);
  ee.emit('x', 42);
  ee.emit('x', 42);

  const removed = common.mustNotCall();
  ee[method]('y', removed);
  ee.removeListener('y', removed);
  assert.strictEqual(ee.emit('y'), false);

  // A failed registration must not leave the manager's guard set.
  const failure = new Error('newListener');
  ee.on('newListener', () => { throw failure; });
  assert.throws(() => ee[method]('z', listener), (err) => err === failure);
  ee.removeAllListeners('newListener');
  ee[method]('after', common.mustCall(() => {
    assert.strictEqual(api.context.active(), context);
  }));
  ee.emit('after');
}
api.context.disable();
