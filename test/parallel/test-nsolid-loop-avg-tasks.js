'use strict';
const common = require('../common');
const assert = require('node:assert');
const fs = require('node:fs');
const nsolid = require('nsolid');

const before = nsolid.metrics();
let completed = 0;
function work() {
  fs.stat(__filename, common.mustSucceed(() => {
    if (++completed < 50) {
      setImmediate(work);
      return;
    }
    nsolid.metrics(common.mustSucceed((metrics) => {
      console.log({ loopAvgTasks: metrics.loopAvgTasks,
                    eventsProcessed: metrics.eventsProcessed,
                    loopIterations: metrics.loopIterations });
      assert.ok(metrics.eventsProcessed > before.eventsProcessed);
      assert.ok(metrics.loopIterations > before.loopIterations);
      assert.ok(Number.isFinite(metrics.loopAvgTasks));
      assert.ok(metrics.loopAvgTasks > 0);
    }));
  }));
}
work();
