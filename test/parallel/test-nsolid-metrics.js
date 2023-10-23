'use strict';

require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const metricsUtil = require('../common/nsolid-metrics-util.js');

assert.strictEqual(nsolid.getThreadName(), '');
const syncMetrics = nsolid.metrics();
metricsUtil.checkMetrics(syncMetrics);
/* Check some specific metrics on 1st loop iteration */
assert.strictEqual(syncMetrics.loopIdleTime, 0);
assert.strictEqual(syncMetrics.loopIterations, 0);
assert.strictEqual(syncMetrics.loopIterWithEvents, 0);
assert(syncMetrics.loopEstimatedLag > 0);

nsolid.metrics((er, m) => {
  assert.strictEqual(er, null);
  metricsUtil.checkMetrics(m);
  assert.strictEqual(m.threadName, '');
  nsolid.setThreadName('my_thread');
  assert.strictEqual(nsolid.getThreadName(), 'my_thread');
  nsolid.metrics((er, m) => {
    assert.strictEqual(er, null);
    metricsUtil.checkMetrics(m);
    assert.strictEqual(m.threadName, 'my_thread');
  });
});
