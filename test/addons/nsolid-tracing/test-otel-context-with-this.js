// Flags: --expose-internals
'use strict';

const common = require('../../common');
const assert = require('assert');
const { contextManager } = require('internal/otel/context');
const fixtures = require('../../common/fixtures');
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixtures.fixturesDir] }));

assert.ok(api.context.setGlobalContextManager(contextManager));
const context = api.ROOT_CONTEXT.setValue('test', 'with');
const receiver = {};
const prior = api.context.active();
assert.strictEqual(api.context.with(context, common.mustCall(function(a, b) {
  assert.strictEqual(this, receiver);
  assert.strictEqual(api.context.active(), context);
  assert.deepStrictEqual([a, b], [1, 2]);
  return a + b;
}), receiver, 1, 2), 3);
const error = new Error('callback');
assert.throws(() => api.context.with(context, common.mustCall(function() {
  assert.strictEqual(this, receiver);
  throw error;
}), receiver), (err) => err === error);
assert.strictEqual(api.context.active(), prior);
for (const receiver of [null, undefined]) {
  api.context.with(context, common.mustCall(function(value) {
    assert.strictEqual(this, null);
    assert.strictEqual(value, 42);
    assert.strictEqual(api.context.active(), context);
  }), receiver, 42);
}
api.context.disable();
