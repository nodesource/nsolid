// Flags: --expose-internals
import { mustCall, mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import dns from 'node:dns';
import dgram from 'node:dgram';
import http from 'node:http';
import { once } from 'node:events';
import { promisify } from 'node:util';
import nsolid from 'nsolid';
import { internalBinding } from 'internal/test/binding';
import { GRPCServer } from '../common/nsolid-grpc-agent/index.js';
import { OTLPGRPCServer, OTLPServer } from '../common/nsolid-otlp-agent/index.js';
import { parseDNSPacket, writeDNSPacket } from '../common/dns.js';

const invalidName = 'nsolid-histogram.invalid';

if (process.argv[2] === 'child') {
  nsolid.start({ tracingEnabled: false });
  nsolid.setThreadName('histograms');
  process.on('message', mustCall(async (message) => {
    if (message === 'exit') process.exit(0);
    assert.strictEqual(message, 'run');
    await promisify(dns.lookup)('localhost');
    await promisify(dns.lookup)('localhost', { all: true });
    await dns.promises.lookup('localhost');
    await dns.promises.lookup('localhost', { all: true });
    await assert.rejects(promisify(dns.lookup)(invalidName), { code: 'ENOTFOUND' });
    await assert.rejects(dns.promises.lookup(invalidName), { code: 'ENOTFOUND' });
    await promisify(dns.lookupService)('127.0.0.1', 80);
    await dns.promises.lookupService('127.0.0.1', 80);

    // Exercise both c-ares completion paths without an external DNS server.
    const server = dgram.createSocket('udp4');
    server.on('message', (packet, peer) => {
      const query = parseDNSPacket(packet);
      server.send(writeDNSPacket({
        ...query,
        flags: 0x8180,
        answers: [{ ...query.questions[0], ttl: 60, address: '127.0.0.1' }],
      }), peer.port, peer.address);
    });
    server.bind(0, '127.0.0.1');
    await once(server, 'listening');
    const address = `127.0.0.1:${server.address().port}`;
    const resolver = new dns.Resolver();
    resolver.setServers([address]);
    await promisify(resolver.resolve4.bind(resolver))('histogram.test');
    const promiseResolver = new dns.promises.Resolver();
    promiseResolver.setServers([address]);
    await promiseResolver.resolve4('histogram.test');
    server.close();

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

    for (const key of ['gcDurUs99Ptile', 'gcDurUsMedian', 'dns99Ptile', 'dnsMedian',
                       'httpClient99Ptile', 'httpClientMedian',
                       'httpServer99Ptile', 'httpServerMedian']) {
      assert.strictEqual(typeof nsolid.metrics()[key], 'number');
    }

    // A known input verifies milliseconds-to-seconds conversion exactly.
    internalBinding('nsolid_api').pushDnsBucket(1500, 'units.test', '');
    process.send('done');
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
      const state = { localhost: 0, failed: 0, reverse: 0, resolved: 0,
                      units: 0, client: 0, server: 0 };
      states.push(state);
      server.on('metrics', mustCallAtLeast((data) => {
        for (const resource of data.resourceMetrics || []) {
          for (const scope of resource.scopeMetrics || []) {
            for (const metric of scope.metrics || []) {
              if (!['dns.lookup.duration',
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
                switch (attrs['dns.question.name']) {
                  case 'localhost':
                    assert.strictEqual(attrs['error.type'], undefined);
                    state.localhost += count;
                    break;
                  case invalidName:
                    assert.strictEqual(attrs['error.type'], 'ENOTFOUND');
                    state.failed += count;
                    break;
                  case 'histogram.test':
                    assert.strictEqual(attrs['error.type'], undefined);
                    state.resolved += count;
                    break;
                  case 'units.test':
                    assert.strictEqual(point.sum, 1.5);
                    assert.strictEqual(point.min, 1.5);
                    assert.strictEqual(point.max, 1.5);
                    state.units += count;
                    break;
                  case undefined:
                    state.reverse += count;
                    break;
                }
                assert.ok(state.localhost <= 4, 'duplicate DNS window');
                assert.ok(state.failed <= 2, 'duplicate failed DNS window');
                assert.ok(state.resolved <= 2, 'duplicate resolver window');
                assert.ok(state.units <= 1, 'duplicate units window');
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
      while (!bounds || !states.every((s) => s.localhost === 4 && s.failed === 2 &&
        s.reverse === 2 && s.resolved === 2 && s.units === 1 &&
        s.client === 1 && s.server === 1)) {
        assert.ok(Date.now() < deadline, `${mode}: ${JSON.stringify(states)}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      // Wait another window to catch accidental cumulative re-export.
      await new Promise((resolve) => setTimeout(resolve, 300));
      for (const state of states) {
        assert.strictEqual(state.localhost, 4);
        assert.strictEqual(state.failed, 2);
        assert.strictEqual(state.resolved, 2);
        assert.strictEqual(state.units, 1);
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
