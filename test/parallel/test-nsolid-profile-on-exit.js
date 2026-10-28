'use strict';

const common = require('../common');
const assert = require('assert');
const cp = require('child_process');
const nsolid = require('nsolid');

// Make sure N|Solid exits when receiving a terminating signal while performing
// a CPU Profile
if (process.argv[2] === 'child') {
  // Configure the console so the `profile()` call may succeed
  nsolid.start({
    command: 'localhost:9001',
    data: 'localhost:9002'
  });

  setTimeout(() => {
    nsolid.profile(common.mustSucceed(() => {}));
    process.send('ready');
  }, 100);
} else {
  const child = cp.spawn(process.execPath,
                         [ __filename, 'child' ],
                         { stdio: ['ipc', 'pipe', 'pipe'] });
  child.on('exit', common.mustCall((code, signal) => {
    assert.strictEqual(signal, 'SIGTERM');
  }));

  child.on('message', common.mustCall((message) => {
    assert.strictEqual(message, 'ready');
    child.kill('SIGTERM');
  }));
}
