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
  assert.strictEqual(metrics.httpClientCount, 0);
  assert.strictEqual(metrics.httpClientAbortCount, 1);
  // Wait for more than 3 secs for the percentiles to be updated
  setTimeout(common.mustCall(() => {
    const metrics = require('nsolid').metrics();
    assert.strictEqual(metrics.httpClientMedian, 0);
    assert.strictEqual(metrics.httpClient99Ptile, 0);
  }), 3500);
}));
