'use strict';

const common = require('../common');
const assert = require('assert');

fetch(`http://127.0.0.1:${common.PORT}`).then(() => {
}).catch(common.mustCall((err) => {
  assert.strictEqual(err.name, 'TypeError');
  assert.strictEqual(err.message, 'fetch failed');
  const undiciError = err.cause;
  assert.strictEqual(undiciError.name, 'Error');
  assert.ok(undiciError.message.startsWith('connect ECONNREFUSED'));
  assert.strictEqual(undiciError.code, 'ECONNREFUSED');
  const metrics = require('nsolid').metrics();
  assert.ok(!Object.hasOwn(metrics, 'httpClientCount'));
  assert.strictEqual(metrics.httpClientAbortCount, 1);

}));
