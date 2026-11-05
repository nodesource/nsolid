'use strict';

// An abort must end the process even when stderr is a full pipe that nobody
// reads. The handler from before N|Solid's then blocks writing its backtraces,
// so only the watchdog can end the process, and it must not write first.

const common = require('../common');
if (!common.isLinux) {
  common.skip('fills a FIFO the Linux way');
}

const assert = require('assert');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const tmpdir = require('../common/tmpdir');

tmpdir.refresh();
const fifo = path.join(tmpdir.path, 'stderr');
execFileSync('mkfifo', [fifo]);

const { O_NONBLOCK, O_RDONLY, O_WRONLY } = fs.constants;
// The read end stays open, and is never read.
const reader = fs.openSync(fifo, O_RDONLY | O_NONBLOCK);
const filler = fs.openSync(fifo, O_WRONLY | O_NONBLOCK);
for (const size of [4096, 1]) {
  const chunk = Buffer.alloc(size, 'x');
  assert.throws(() => {
    for (;;) fs.writeSync(filler, chunk);
  }, { code: 'EAGAIN' });
}
fs.closeSync(filler);

// A blocking descriptor on the full pipe: the child's first write to stderr
// blocks.
const stderr = fs.openSync(fifo, O_WRONLY);
const start = Date.now();
const child = spawn(process.execPath, ['-e', 'process.abort()'], {
  stdio: ['ignore', 'ignore', stderr],
});
fs.closeSync(stderr);

const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
child.on('exit', common.mustCall((code, signal) => {
  clearTimeout(timer);
  fs.closeSync(reader);
  // SIGKILL means the abort hung.
  assert.strictEqual(signal, 'SIGABRT');
  // The watchdog gives the exit hooks 10 seconds.
  assert.ok(Date.now() - start >= 9000);
}));
