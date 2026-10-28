// Flags: --expose-internals
import { mustCall, mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import nsolid from 'nsolid';

if (process.argv[2] === 'child') {
  const traces = process.argv[3] === 'traces';
  nsolid.start({ pauseMetrics: traces });
  const interval = setInterval(() => {}, 100);
  process.on('message', mustCall(() => {
    clearInterval(interval);
    process.exit(0);
  }));
  if (traces) {
    const server = http.createServer((req, res) => res.end());
    server.listen(0, '127.0.0.1', mustCall(() => {
      http.get(`http://127.0.0.1:${server.address().port}`, (res) => {
        res.resume();
        res.on('end', () => server.close());
      });
    }));
  }
} else {
  for (const type of ['traces', 'metrics']) {
    for (const insecureEnv of [false, true]) {
      // Inspect the wire so a plaintext HTTP/2 preface cannot pass as TLS.
      const server = net.createServer();
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const handshake = new Promise((resolve) => {
        server.on('connection', mustCallAtLeast((socket) => {
          socket.once('data', mustCall((data) => {
            assert.strictEqual(data[0], 22);
            assert.strictEqual(data[1], 3);
            socket.destroy();
            resolve();
          }));
        }));
      });
      const env = {
        NSOLID_OTLP: 'otlp',
        NSOLID_OTLP_CONFIG: JSON.stringify({
          url: `https://127.0.0.1:${server.address().port}`,
          protocol: 'grpc',
        }),
        NSOLID_INTERVAL: '100',
        NSOLID_TRACING_ENABLED: type === 'traces' ? '1' : '0',
      };
      if (insecureEnv) {
        env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317';
        env.OTEL_EXPORTER_OTLP_TRACES_INSECURE = 'true';
        env.OTEL_EXPORTER_OTLP_METRICS_INSECURE = 'true';
      }
      const child = fork(import.meta.filename, ['child', type], { env });
      const exited = once(child, 'exit');
      await handshake;
      child.send('exit');
      const [code, signal] = await exited;
      assert.strictEqual(code, 0);
      assert.strictEqual(signal, null);
      await new Promise((resolve) => server.close(mustSucceed(resolve)));
    }
  }
}
