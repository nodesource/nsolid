'use strict';

const common = require('../common');
const assert = require('node:assert');
const { getSystemErrorName } = require('node:util');
const nsolid = require('nsolid');

// Keep old thread-keyed automatic stop timers outside this test's lifetime.
const profileDuration = common.platformTimeout(600000);

nsolid.start({
  command: 'localhost:9001',
  data: 'localhost:9002',
  bulk: 'localhost:9003',
});

// Each callback immediately starts another asset while the agent may still be
// draining the preceding stream. A busy result must reach JS without aborting.
// The test harness bounds retries; throttling lets the agent drain its queue.

function snapshots(left) {
  nsolid.snapshot(common.mustCall((err) => {
    if (err) {
      assert.ok(['EEXIST', 'ENOTCONN'].includes(getSystemErrorName(err.code)));
      setTimeout(common.mustCall(() => snapshots(left)), 10);
    } else if (left > 1) {
      snapshots(left - 1);
    } else {
      profiles(40);
    }
  }));
}

function profiles(left) {
  nsolid.profile(profileDuration, common.mustCall((err) => {
    if (err) {
      assert.ok(['EEXIST', 'ENOTCONN'].includes(getSystemErrorName(err.code)));
      setTimeout(common.mustCall(() => profiles(left)), 10);
      return;
    }
    stopProfile(common.mustCall(() => {
      if (left > 1) profiles(left - 1);
      else setTimeout(common.mustCall(reuse), 10);
    }));
  }));
}

function reuse() {
  // After draining, the reservation must permit a new collection.
  nsolid.profile(profileDuration, common.mustCall((err) => {
    if (err) {
      assert.ok(['EEXIST', 'ENOTCONN'].includes(getSystemErrorName(err.code)));
      setTimeout(common.mustCall(reuse), 10);
    } else {
      stopProfile(common.mustCall());
    }
  }));
}

function waitForAgent() {
  // Configuration reaches the agent through a separate queue.
  nsolid.profile(profileDuration, common.mustCall((err) => {
    if (err) {
      assert.ok(['EEXIST', 'ENOTCONN'].includes(getSystemErrorName(err.code)));
      setTimeout(common.mustCall(waitForAgent), 10);
    } else {
      stopProfile(common.mustCall(() => snapshots(5)));
    }
  }));
}

function stopProfile(cb) {
  nsolid.profileEnd(common.mustCall((err) => {
    if (err) {
      // A successful request can still be waiting for its native start command.
      assert.strictEqual(getSystemErrorName(err.code), 'ENOENT');
      setTimeout(common.mustCall(() => stopProfile(cb)), 10);
    } else {
      cb();
    }
  }));
}

waitForAgent();
