'use strict';

const {
  getTimeOriginTimestamp,
} = internalBinding('performance');
const binding = internalBinding('nsolid_api');
// Simply require this here in order to initialize it.
require('internal/agents/statsd/lib/nsolid');
require('internal/agents/zmq/lib/nsolid');

module.exports = {
  // Store a copy of argv so it can't be altered by the user before being
  // read by nsolid.
  ARGV: process.argv.slice(),
  init,
};

// Use this to record custom startup times.
process.recordStartupTime = binding.recordStartupTime;

function init() {
  // Internal timer to run a manually run a function in an uv timer so it
  // doesn't register with node's internal handle wrap and cause async_hooks
  // tests to fail.
  let delay = +process.env.NSOLID_DELAY_INIT || 0;
  if (delay > 0x7fffffff) {
    delay = 0x7fffffff;
  } else if (delay < 0) {
    // A delay of zero given directly to uv_timer_start will cause the timer
    // to run the next time timers are processed. Which is the first phase
    // of the uv loop.
    delay = 0;
  }
  binding.runStartInTimeout(() => require('nsolid').start(), delay);

  // Store the performance.timeOrigin value so we can use it to calculate the
  // current timestamp with higher precision using performance.now().
  binding.setTimeOrigin(getTimeOriginTimestamp());
}
