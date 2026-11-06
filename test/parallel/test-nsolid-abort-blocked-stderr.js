'use strict';

// An abort must end the process even when stderr is a full pipe that nobody
// reads, where the handler from before N|Solid's blocks writing its
// backtraces. The watchdog ends it without writing first, and when the
// watchdog can't start, the process ends at once. A process started from a
// --snapshot-blob gets the same handler.

const common = require('../common');
if (!common.isLinux) {
  common.skip('fills a FIFO the Linux way');
}

const assert = require('assert');
const { execFileSync, spawn } = require('child_process');
const { spawnSyncAndExitWithoutError } = require('../common/child_process');
const fs = require('fs');
const tmpdir = require('../common/tmpdir');

const { O_NONBLOCK, O_RDONLY, O_WRONLY } = fs.constants;

tmpdir.refresh();

// A snapshot whose main function aborts.
fs.writeFileSync(tmpdir.resolve('entry.js'),
                 "require('v8').startupSnapshot" +
                 '.setDeserializeMainFunction(() => process.abort());\n');
const blob = tmpdir.resolve('snapshot.blob');
spawnSyncAndExitWithoutError(process.execPath, [
  '--snapshot-blob', blob, '--build-snapshot', 'entry.js',
], { cwd: tmpdir.path });

// Runs N|Solid with `args` and a full FIFO as stderr, and checks that SIGABRT
// ends it after a time `expected` accepts. SIGKILL means it hung.
function abortWithFullStderr(name, args, expected) {
  const fifo = tmpdir.resolve(name);
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
    const ms = Date.now() - start;
    assert.strictEqual(signal, 'SIGABRT', `${name}: ${signal} after ${ms} ms`);
    assert.ok(expected(ms), `${name}: ended after ${ms} ms`);
  }));
}

// The watchdog gives the exit hooks 10 seconds, then ends the process.
abortWithFullStderr('watchdog', ['-e', 'process.abort()'], (ms) => ms >= 9000);

// With no watchdog, nothing would end it later, so it ends at once.
abortWithFullStderr('no-watchdog', [
  '--expose-internals',
  '-e',
  "require('internal/test/binding').internalBinding('nsolid_api')" +
    '.failAbortWatchdogForTesting(); process.abort();',
], (ms) => ms < 9000);

// Started from a snapshot, it still aborts through the watchdog.
abortWithFullStderr('snapshot', ['--no-warnings', '--snapshot-blob', blob],
                    (ms) => ms >= 9000);
