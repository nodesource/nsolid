// Flags: --expose-internals
'use strict';

const common = require('../common');
const assert = require('assert');
const { isMainThread } = require('worker_threads');
if (!isMainThread)
  common.skip('This test only works on a main thread');

const { internalBinding } = require('internal/test/binding');
const binding = internalBinding('nsolid_api');

assert.strictEqual(binding.getConfigVersion(), 0);
binding.updateConfig(JSON.stringify({ assetsEnabled: '' }));
assert.strictEqual(binding.getConfigVersion(), 0);
assert.strictEqual(binding.getConfig(), null);

process.env.NSOLID_APPNAME = 'first-valid-config';
process.env.NSOLID_INTERVAL = '1234';
process.env.NSOLID_ASSETS_ENABLED = '0';
const nsolid = require('nsolid');
nsolid.start();
assert.strictEqual(nsolid.config.app, 'first-valid-config');
assert.strictEqual(nsolid.config.interval, 1234);
assert.strictEqual(nsolid.config.assetsEnabled, false);

binding.updateConfig(JSON.stringify({ assetsEnabled: '', app: 'valid-sibling' }));
assert.strictEqual(binding.getConfig().app, 'valid-sibling');
assert.strictEqual(binding.getConfig().assetsEnabled, false);
