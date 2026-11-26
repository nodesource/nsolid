'use strict';
// A DispatchQueue queues at most one run for the items that pass its max (100
// here) and none while a run is in progress. The items that pass it during a
// run are processed right after it, without another Enqueue().
const common = require('../../common');
const { isMainThread } = require('worker_threads');

// Unloading the addon from a worker would destroy its queue and leave the
// N|Solid thread with work whose code is gone.
if (!isMainThread)
  common.skip('the addon must not be unloaded from a worker');

const assert = require('assert');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

binding.initSchedule();

// 250 items enqueued while the N|Solid thread is held queue a single run.
binding.holdThread();
binding.holdNextBatch();
binding.enqueue(250);
binding.release();

// That run is held in its dispatch callback. The items enqueued past max now
// don't queue another run, but are processed once it's done, even if the
// queue is restarted (with its 1 h period) right after it.
binding.waitHeld();
binding.enqueue(150);
binding.restart();
binding.release();

function check() {
  if (binding.batches().length < 2) {
    setTimeout(check, 10);
    return;
  }

  // Wait for anything else queued so far to have run.
  binding.holdThread();
  binding.release();
  assert.deepStrictEqual(binding.batches(), [250, 150]);
}

check();
