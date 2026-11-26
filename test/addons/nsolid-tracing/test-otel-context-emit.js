// Flags: --expose-internals
'use strict';

const common = require('../../common');
const assert = require('assert');
const { AsyncLocalStorage } = require('async_hooks');
const AsyncContextFrame = require('internal/async_context_frame');
const { ROOT_CONTEXT } = require('internal/otel/api');
const {
  contextManager,
  emitInOtelContext,
  kNoOtelFrame,
} = require('internal/otel/context');

const context = ROOT_CONTEXT.setValue('test', 'bound');
const nestedContext = ROOT_CONTEXT.setValue('test', 'nested');
const state = { ctx: context, prior: kNoOtelFrame, frame: undefined };
const nested = { ctx: nestedContext, prior: kNoOtelFrame, frame: undefined };
const receiver = {};
const error = new Error('listener');
const als = new AsyncLocalStorage();

function check(store) {
  assert.strictEqual(this, receiver);
  assert.strictEqual(contextManager.active(), context);
  assert.strictEqual(als.getStore(), store);
  return 42;
}

// Exercise the undefined prior frame, then restore the test's original frame.
const original = AsyncContextFrame.exchange(undefined);
try {
  assert.strictEqual(emitInOtelContext(state, check, receiver, [undefined]), 42);
  const frame = state.frame;
  assert.strictEqual(emitInOtelContext(state, check, receiver, [undefined]), 42);
  if (AsyncContextFrame.enabled) {
    assert.notStrictEqual(frame, undefined);
    assert.strictEqual(state.frame, frame);
    assert.strictEqual(AsyncContextFrame.current(), undefined);
  }
  emitInOtelContext(state, common.mustCall(() => {
    contextManager.disable();
    contextManager.enable();
  }), null, []);
  assert.strictEqual(emitInOtelContext(state, check, receiver, [undefined]), 42);
} finally {
  AsyncContextFrame.set(original);
}

for (const store of ['A', 'B']) {
  als.run(store, common.mustCall(() => {
    assert.strictEqual(emitInOtelContext(state, check, receiver, [store]), 42);
    const prior = AsyncContextFrame.current();
    const throwing = common.mustCall(() => {
      assert.strictEqual(contextManager.active(), context);
      emitInOtelContext(nested, common.mustCall(() => {
        assert.strictEqual(contextManager.active(), nestedContext);
        assert.strictEqual(als.getStore(), store);
      }), null, []);
      assert.strictEqual(contextManager.active(), context);
      throw error;
    });
    assert.throws(() => emitInOtelContext(state, throwing, null, []),
                  (err) => err === error);
    assert.strictEqual(als.getStore(), store);
    if (AsyncContextFrame.enabled) {
      assert.strictEqual(AsyncContextFrame.current(), prior);
    }
  }));
}

contextManager.with(context, common.mustCall(() => {
  const prior = AsyncContextFrame.current();
  emitInOtelContext(state, common.mustCall(() => {
    assert.strictEqual(contextManager.active(), context);
    assert.strictEqual(AsyncContextFrame.current(), prior);
  }), null, []);
}));

als.run('before', common.mustCall(() => {
  const prior = contextManager.active();
  emitInOtelContext(state, common.mustCall(() => {
    als.enterWith('after');
    assert.strictEqual(contextManager.active(), context);
  }), null, []);
  assert.strictEqual(als.getStore(), 'after');
  assert.strictEqual(contextManager.active(), prior);
}));
