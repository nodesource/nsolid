'use strict';

const { buildType, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const binding = require(bindingPath);
const { Worker, isMainThread, threadId } = require('worker_threads');

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Test must first run as the main thread');

function registerHook(state) {
  binding.registerJSCodeEventCallback(state.hookIndex, (fnName, tid) => {
    state.called = true;
    assert.strictEqual(typeof fnName, 'string');
    state.customFnNameReceived |= fnName.indexOf('nsolidTestEvent') !== -1;
    assert.strictEqual(tid, threadId);
  });
}

function resetState(state) {
  state.called = false;
  state.customFnNameReceived = false;
}


function doTest(hookIndex1, hookIndex2) {
  const state1 = {
    called: false,
    customFnNameReceived: false,
    hookIndex: hookIndex1,
  };

  const state2 = {
    called: false,
    customFnNameReceived: false,
    hookIndex: hookIndex2,
  };

  registerHook(state1);
  registerHook(state2);

  // Trigger a code event (function definition)
  binding.triggerCodeEvent();

  // Wait a tick to allow the hook to fire
  setTimeout(() => {
    assert.ok(state1.called, 'Code event hook was not called');
    assert.ok(state1.customFnNameReceived, 'Custom function name was not received');
    assert.ok(state2.called, 'Code event hook was not called');
    assert.ok(state2.customFnNameReceived, 'Custom function name was not received');

    // Unregister the hooks
    binding.unregisterCodeEventHook(hookIndex1);

    resetState(state1);
    resetState(state2);

    // The hook should not be called after unregistering
    binding.triggerCodeEvent();
    setTimeout(() => {
      assert.ok(!state1.called, 'Code event hook was called after unregistering');
      assert.ok(state2.called, 'Code event hook was not called after unregistering');
      binding.unregisterCodeEventHook(hookIndex2);
      resetState(state1);
      resetState(state2);
      setTimeout(() => {
        assert.ok(!state1.called, 'Code event hook was called after unregistering');
        assert.ok(!state2.called, 'Code event hook was called after unregistering');
        binding.unregisterAllHooks();
      }, 500);
    }, 500);
  }, 500);
}

let hookIndex1;
let hookIndex2;

if (isMainThread) {
  hookIndex1 = binding.registerCodeEventHook();
  hookIndex2 = binding.registerCodeEventHook();
  const worker = new Worker(__filename, { argv: [process.pid, hookIndex1, hookIndex2] });
  worker.on('exit', (code) => {
    assert.strictEqual(code, 0);
  });
} else {
  hookIndex1 = +process.argv[3];
  hookIndex2 = +process.argv[4];
}

doTest(hookIndex1, hookIndex2);
