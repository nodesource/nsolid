'use strict';
const common = require('../common.js');
const { spawnSync } = require('child_process');
const path = require('path');

// This benchmarks the startup of various CLI tools that are already
// checked into the source code. We use --version because the output
// tends to be minimal and fewer operations are done to generate
// these so that the startup cost is still dominated by a more
// indispensible part of the CLI.
const bench = common.createBenchmark(main, {
  cli: [
    'tools/node_modules/eslint/bin/eslint.js',
    'deps/npm/bin/npm-cli.js',
    'deps/corepack/dist/corepack.js',
  ],
  count: [30],
});

function spawnProcess(cli, bench, state) {
  const cmd = process.execPath || process.argv[0];
  while (state.finished < state.count) {
    const child = spawnSync(cmd, [cli, '--version'], {
      env: { npm_config_loglevel: 'silent', ...process.env },
    });
    // Log some information for debugging if it fails, which it shouldn't.
    if (child.status !== 0) {
      console.log('---- STDOUT ----');
      console.log(child.stdout.toString());
      console.log('---- STDERR ----');
      console.log(child.stderr.toString());
      throw new Error(`Child process stopped with exit code ${child.status}`);
    }
    state.finished++;
    if (state.finished === 0) {
      // Finished warmup.
      bench.start();
    }

    if (state.finished === state.count) {
      bench.end(state.count);
    }
  }
}

function main({ count, cli }) {
  cli = path.resolve(__dirname, '../../', cli);
  const warmup = 3;
  const state = { count, finished: -warmup };
  spawnProcess(cli, bench, state);
}
