// Measure HTTP client request throughput with N|Solid tracing enabled.
'use strict';

const assert = require('assert');
const common = require('../common.js');
const http = require('http');

const bench = common.createBenchmark(main, {
  tracing: ['off', 'unsampled', 'sampled'],
  c: [32],
  n: [2e4],
}, {
  flags: ['--expose-internals', '--no-warnings'],
});

function main({ tracing, c, n }) {
  assert(Number.isInteger(n) && n > 0);
  assert(Number.isInteger(c) && c > 0);
  const binding = common.binding('nsolid_api');
  const { kSpanHttpClient } = binding.nsolid_consts;
  if (tracing !== 'off') {
    binding.trace_flags[0] = kSpanHttpClient;
    binding.trace_sample_rate[0] = tracing === 'sampled' ? 1 : 0;
  }

  const agent = new http.Agent({ keepAlive: true, maxSockets: c });
  const server = http.createServer((req, res) => res.end('ok'));
  server.listen(0, '127.0.0.1', () => {
    const options = {
      agent,
      host: '127.0.0.1',
      port: server.address().port,
      path: '/a/b?c=1',
    };
    const warmup = Math.min(n, 2e3);
    let started = 0;
    let completed = 0;
    let target = warmup;

    function request() {
      started++;
      http.get(options, (res) => {
        res.resume();
        res.on('end', onEnd);
      });
    }

    function onEnd() {
      completed++;
      if (started < target) {
        request();
      } else if (completed === target) {
        if (target === warmup) {
          started = 0;
          completed = 0;
          target = n;
          bench.start();
          for (let i = 0; i < c && i < n; i++) request();
        } else {
          bench.end(n);
          server.close();
          agent.destroy();
        }
      }
    }

    for (let i = 0; i < c && i < warmup; i++) request();
  });
}
