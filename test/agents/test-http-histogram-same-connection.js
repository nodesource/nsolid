// Flags: --expose-internals
'use strict';
const common = require('../common');
const assert = require('assert');
const http = require('http');
const net = require('net');
const { fork } = require('child_process');
const { once } = require('events');
const { setTimeout: delay } = require('timers/promises');


if (process.argv[2] === 'child') {
  process.on('message', common.mustCall(() => process.exit(0)));
  let n_reqs = 0;
  const server = http.createServer(common.mustCall((req, res) => {
    setTimeout(() => {
      res.end();
      if (++n_reqs === 6) {
        server.close();
      }
    }, 150);
  }, 6));

  server.listen(0, 'localhost', common.mustCall(() => {
    const port = server.address().port;
    const req = `GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
                'Connection: keep-alive\r\n\r\n';
    const c = net.createConnection(port, common.mustCall(() => {
      for (let i = 0; i < 5; ++i) {
        c.write(req);
      }
      setTimeout(() => {
        c.write(req);
      }, 100);
    }));

    c.resume();
  }));
} else {
  (async () => {
    const { GRPCServer } = await import('../common/nsolid-grpc-agent/index.js');
    const server = new GRPCServer();
    const port = await new Promise((resolve) => server.start(common.mustSucceed(resolve)));
    let count = 0;
    server.on('metrics', common.mustCallAtLeast((data) => {
      for (const resource of data.resourceMetrics || []) {
        for (const scope of resource.scopeMetrics || []) {
          for (const metric of scope.metrics || []) {
            if (metric.name !== 'http.server.request.duration') continue;
            for (const point of metric.exponentialHistogram.dataPoints) {
              assert.ok(point.min >= 0.1);
              count += Number(point.count);
              assert.ok(count <= 6);
            }
          }
        }
      }
    }));
    const child = fork(__filename, ['child'], {
      env: { NSOLID_GRPC: `localhost:${port}`, NSOLID_GRPC_INSECURE: 1,
             NSOLID_INTERVAL: 50 },
    });
    // Keep the child alive until its completed histograms have been exported.
    try {
      const deadline = Date.now() + 15000;
      while (count < 6) {
        assert.ok(Date.now() < deadline, `expected six requests, got ${count}`);
        await delay(50);
      }
      child.send('exit');
      const [code] = await once(child, 'exit');
      assert.strictEqual(code, 0);
    } finally {
      if (child.exitCode === null) child.kill();
      server.close();
    }
  })().then(common.mustCall());
}
