// Flags: --expose-internals --expose-gc
import { mustCall, mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
import { performance, constants } from 'node:perf_hooks';
import nsolid from 'nsolid';
import { GRPCServer } from '../common/nsolid-grpc-agent/index.js';
import { OTLPGRPCServer, OTLPServer } from '../common/nsolid-otlp-agent/index.js';

const gcCount = 3;

if (process.argv[2] === 'child') {
  nsolid.start({ tracingEnabled: false });
  nsolid.setThreadName('histograms');
  process.on('message', mustCall(async (message) => {
    if (message === 'exit') process.exit(0);
    assert.strictEqual(message, 'run');
    let gcSeconds = 0;
    for (let i = 0; i < gcCount; i++) {
      const start = performance.now();
      global.gc();
      gcSeconds += (performance.now() - start) / 1000;
    }
    global.gc({ type: 'minor' });
    const httpServer = http.createServer((req, res) => res.end());
    httpServer.listen(0, '127.0.0.1');
    await once(httpServer, 'listening');
    await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${httpServer.address().port}`, (res) => {
        res.resume();
        res.on('end', resolve);
      });
    });
    httpServer.close();

    for (const key of ['gcCount', 'gcForcedCount', 'gcFullCount', 'gcMajorCount',
                       'dnsCount', 'httpClientCount', 'httpServerCount',
                       'gcDurUs99Ptile', 'gcDurUsMedian', 'dns99Ptile', 'dnsMedian',
                       'httpClient99Ptile', 'httpClientMedian',
                       'httpServer99Ptile', 'httpServerMedian']) {
      assert.ok(!Object.hasOwn(nsolid.metrics(), key));
    }

    process.send({ gcSeconds, agentId: nsolid.id });
  }, 2));
  process.send('ready');
} else {
  for (const mode of ['grpc', 'otlp-grpc', 'otlp-http', 'both']) {
    const servers = [];
    const env = {
      NSOLID_INTERVAL: 100,
      NSOLID_GRPC_INSECURE: 1,
    };
    const states = [];
    for (const transport of mode === 'both' ? ['grpc', 'otlp-grpc'] : [mode]) {
      const server = transport === 'grpc' ? new GRPCServer() :
        transport === 'otlp-grpc' ? new OTLPGRPCServer() : new OTLPServer();
      const port = await new Promise((resolve) => server.start(mustSucceed(resolve)));
      servers.push(server);
      if (transport === 'grpc') {
        env.NSOLID_GRPC = `localhost:${port}`;
      } else {
        env.NSOLID_OTLP = 'otlp';
        env.NSOLID_OTLP_CONFIG = JSON.stringify({
          url: `http://localhost:${port}`,
          protocol: transport === 'otlp-grpc' ? 'grpc' : 'http',
        });
      }
      const state = { major: 0, minor: 0, gcSum: 0, client: 0, server: 0 };
      states.push(state);
      server.on('metrics', mustCallAtLeast((data) => {
        for (const resource of data.resourceMetrics || []) {
          for (const scope of resource.scopeMetrics || []) {
            for (const metric of scope.metrics || []) {
              if (!['v8js.gc.duration',
                    'http.client.request.duration', 'http.server.request.duration'].includes(metric.name)) continue;
              assert.strictEqual(metric.unit, 's');
              const histogram = metric.exponentialHistogram;
              assert.ok(histogram);
              assert.ok(['AGGREGATION_TEMPORALITY_DELTA', 1].includes(
                histogram.aggregationTemporality));
              for (const point of histogram.dataPoints) {
                const attrs = Object.fromEntries(point.attributes.map(({ key, value }) =>
                  [key, value.stringValue ?? value.intValue]));
                assert.strictEqual(String(attrs['thread.id']), '0');
                assert.strictEqual(attrs['thread.name'], 'histograms');
                assert.ok(BigInt(point.timeUnixNano) > BigInt(point.startTimeUnixNano));
                const count = Number(point.count);
                assert.ok(count > 0);
                assert.ok(point.min >= 0);
                assert.ok(point.max >= point.min);
                assert.ok(point.scale <= 20);
                const bucketCount = (point.positive?.bucketCounts || [])
                  .reduce((sum, n) => sum + Number(n), Number(point.zeroCount || 0));
                assert.strictEqual(bucketCount, count);
                if (metric.name.startsWith('http.')) {
                  const key = metric.name.includes('client') ? 'client' : 'server';
                  state[key] += count;
                  assert.ok(state[key] <= 1, 'duplicate HTTP window');
                  continue;
                }
                if (metric.name === 'v8js.gc.duration') {
                  assert.ok(['major', 'minor', 'incremental', 'weakcb'].includes(attrs['v8js.gc.type']));
                  const flags = Number(attrs['nsolid.gc.flags']);
                  assert.ok(Number.isInteger(flags) && flags >= 0);
                  if (!(flags & constants.NODE_PERFORMANCE_GC_FLAGS_FORCED)) continue;
                  if (attrs['v8js.gc.type'] === 'minor') state.minor += count;
                  if (attrs['v8js.gc.type'] === 'major') {
                    state.major += count;
                    state.gcSum += point.sum;
                  }
                  continue;
                }
              }
            }
          }
        }
      }));
    }
    const child = fork(new URL(import.meta.url), ['child'], { env });
    let bounds;
    child.on('message', (message) => {
      if (message === 'ready') child.send('run');
      else bounds = message;
    });
    try {
      const deadline = Date.now() + 15000;
      while (!bounds || !states.every((s) => s.major >= gcCount && s.minor >= 1 &&
        s.client === 1 && s.server === 1)) {
        assert.ok(Date.now() < deadline, `${mode}: ${JSON.stringify(states)}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      // Wait another window to catch accidental cumulative re-export.
      await new Promise((resolve) => setTimeout(resolve, 300));
      for (const state of states) {
        assert.ok(state.gcSum <= bounds.gcSeconds + 0.001,
                  'GC microseconds must be exported in seconds');
      }
      if (env.NSOLID_GRPC) {
        // Command replies must not replay any exported delta histogram.
        for (let i = 0; i < 2; i++) {
          const { data } = await servers[0].metrics(bounds.agentId);
          const metrics = data.msg.body.resourceMetrics[0].scopeMetrics[0].metrics;
          assert.ok(metrics.length > 0);
          assert.ok(metrics.every((metric) => metric.data !== 'exponentialHistogram'));
        }
      }
      child.send('exit');
      const [code] = await once(child, 'exit');
      assert.strictEqual(code, 0);
    } finally {
      if (child.exitCode === null) child.kill();
      for (const server of servers) server.close();
    }
  }
}
