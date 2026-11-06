'use strict';

// An abort must end the process even when stderr is a full pipe that nobody
// reads, where the handler from before N|Solid's blocks writing its
// backtraces. The watchdog ends it without writing first, and when the
// watchdog can't start, the process ends at once.

const common = require('../common');
if (!common.isLinux) {
  common.skip('fills a FIFO the Linux way');
}

const assert = require('assert');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const tmpdir = require('../common/tmpdir');

const { O_NONBLOCK, O_RDONLY, O_WRONLY } = fs.constants;

tmpdir.refresh();

// Runs N|Solid with `args` and a full FIFO as stderr, then calls back with the
// signal that ended it and how long that took. SIGKILL means it hung.
function abortWithFullStderr(name, args, cb) {
  const fifo = path.join(tmpdir.path, name);
  execFileSync('mkfifo', [fifo]);
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
  const child = spawn(process.execPath, args, {
    stdio: ['ignore', 'ignore', stderr],
  });
  fs.closeSync(stderr);

  const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
  child.on('exit', common.mustCall((code, signal) => {
    clearTimeout(timer);
    fs.closeSync(reader);
    cb(signal, Date.now() - start);
  }));
}

// The watchdog gives the exit hooks 10 seconds, then ends the process.
abortWithFullStderr('watchdog', ['-e', 'process.abort()'], (signal, ms) => {
  assert.strictEqual(signal, 'SIGABRT');
  assert.ok(ms >= 9000, `ended after ${ms} ms`);
});

// With no watchdog, nothing would end it later, so it ends at once.
abortWithFullStderr('no-watchdog', [
  '--expose-internals',
  '-e',
  "require('internal/test/binding').internalBinding('nsolid_api')" +
    '.failAbortWatchdogForTesting(); process.abort();',
], (signal, ms) => {
  assert.strictEqual(signal, 'SIGABRT');
  assert.ok(ms < 9000, `ended after ${ms} ms`);
});
