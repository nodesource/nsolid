// Flags: --expose-internals
'use strict';

require('../common');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { primordials, internalBinding } = require('internal/test/binding');
const { UV_ENOENT, UV_EINVAL } = internalBinding('uv');
let dispatch;
const binding = {
  onCustomCommand(fn) { dispatch = fn; },
  attachRequestToCustomCommand() { return 0; },
  customCommandResponse() { return 0; },
};
const mod = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../../lib/internal/nsolid_custom_commands.js'), 'utf8');
vm.runInNewContext(source, {
  primordials,
  internalBinding(name) { return name === 'uv' ? internalBinding(name) : binding; },
  module: mod,
  require,
});
const register = mod.exports.registerCommandCallback;
register('valid', (request) => request.return('ok'));
for (const name of ['__proto__', 'valueOf', 'hasOwnProperty', 'constructor']) {
  assert.strictEqual(dispatch('request', name, '{}'), UV_ENOENT);
  register(name, (request) => request.return('ok'));
  assert.strictEqual(dispatch('request', name, '{}'), 0);
}
register('throws', () => { throw new Error('handler failed'); });
assert.strictEqual(dispatch('request', 'throws', '{}'), UV_EINVAL);
register('invalid', 1);
assert.strictEqual(dispatch('request', 'invalid', '{}'), UV_ENOENT);
assert.strictEqual(dispatch('request', 'valid', '{}'), 0);
