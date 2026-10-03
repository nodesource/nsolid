'use strict';

// Triggers permission model violations for the permission audit tests.
// Usage: node nsolid-permission-audit.js <basic|limit> <file> <dir> [exit]

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const [mode, file, dir, exit] = process.argv.slice(2);

function done() {
  if (exit === 'exit')
    return;
  // Keep the process alive until the test kills it so all the events can be
  // exported.
  setInterval(() => {}, 1000);
}

if (mode === 'limit') {
  // 1001 unique resources in the main thread.
  for (let i = 0; i <= 1000; i++) {
    try {
      fs.readFileSync(path.join(dir, `missing-${i}`));
    } catch {
      // ENOENT is expected.
    }
  }
  done();
} else {
  // The same resource is reported only once per thread.
  fs.readFileSync(file);
  fs.readFileSync(file);
  fs.writeFileSync(path.join(dir, 'out.txt'), 'nsolid');
  spawnSync(process.execPath, ['-e', '0'], { env: {} });
  const worker = new Worker(
    'require("node:fs").readFileSync(require("node:worker_threads").workerData)',
    { eval: true, workerData: file });
  worker.on('exit', done);
}
