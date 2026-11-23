// Flags: --expose-internals
'use strict';

const common = require('../common');
const assert = require('assert');
const { isMainThread } = require('worker_threads');
if (!isMainThread)
  common.skip('This test only works on a main thread');

const nsolid = require('nsolid');
const { internalBinding } = require('internal/test/binding');
const binding = internalBinding('nsolid_api');
const keys = [
  'assetsEnabled', 'contCpuProfile', 'disableIpv6', 'disablePackageScan',
  'disableSnapshots', 'iisNode', 'pauseMetrics', 'promiseTracking',
  'redactSnapshots',
  'tracingEnabled', 'trackGlobalPackages',
];

nsolid.start();
for (const key of keys) {
  for (const previous of [false, true]) {
    binding.updateConfig(JSON.stringify({ [key]: previous }));
    assert.strictEqual(nsolid.config[key], previous);
    for (const value of ['', 'false', 'x', 0, 1, {}, []]) {
      // A valid sibling forces the update path even when the boolean is ignored.
      binding.updateConfig(JSON.stringify({ [key]: value, app: 'invalid' }));
      assert.strictEqual(nsolid.config[key], previous, key);
      assert.strictEqual(binding.getConfig().app, 'invalid');
      binding.updateConfig(JSON.stringify({ app: 'valid' }));
    }
    // Native updates retain JSON merge-patch deletion semantics.
    binding.updateConfig(JSON.stringify({ [key]: null }));
    assert.strictEqual(Object.hasOwn(nsolid.config, key), false, key);
  }
  binding.updateConfig(JSON.stringify({ [key]: false }));
}

// Helpers must use current configuration after start() or native deletion.
nsolid.start({ pauseMetrics: true });
nsolid.resumeMetrics();
assert.strictEqual(nsolid.config.pauseMetrics, false);
nsolid.pauseMetrics();
binding.updateConfig(JSON.stringify({ pauseMetrics: null }));
nsolid.pauseMetrics();
assert.strictEqual(nsolid.config.pauseMetrics, true);
nsolid.resumeMetrics();

const previous = JSON.stringify(binding.getConfig());
const version = binding.getConfigVersion();
for (const config of ['null', '[]', '"bad"', 'true', '1', '{']) {
  binding.updateConfig(config);
  assert.strictEqual(JSON.stringify(binding.getConfig()), previous);
  assert.strictEqual(binding.getConfigVersion(), version);
}

// Removing promiseTracking must also disable the existing isolate's hooks.
const hook = require('async_hooks').createHook({ init() {}, promiseResolve() {} });
hook.enable();
binding.updateConfig(JSON.stringify({ promiseTracking: true }));
setImmediate(common.mustCall(() => {
  const before = nsolid.metrics();
  new Promise((resolve) => resolve());
  const enabled = nsolid.metrics();
  assert.strictEqual(enabled.promiseCreatedCount, before.promiseCreatedCount + 1);
  assert.strictEqual(enabled.promiseResolvedCount, before.promiseResolvedCount + 1);
  binding.updateConfig(JSON.stringify({ promiseTracking: null }));
  assert.strictEqual(Object.hasOwn(nsolid.config, 'promiseTracking'), false);
  setImmediate(common.mustCall(() => {
    const before = nsolid.metrics();
    new Promise((resolve) => resolve());
    const disabled = nsolid.metrics();
    assert.strictEqual(disabled.promiseCreatedCount, before.promiseCreatedCount);
    assert.strictEqual(disabled.promiseResolvedCount, before.promiseResolvedCount);
    hook.disable();
  }));
}));
