import { mustCall, mustCallAtLeast, mustSucceed, platformTimeout } from '../common/index.mjs';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import nsolid from 'nsolid';

if (process.argv[2] === 'child') {
  process.on('message', mustCall(() => process.exit(0)));
  const traces = process.argv[3] === 'traces';
  nsolid.start({ pauseMetrics: traces });
  if (traces) {
    const server = http.createServer((req, res) => res.end());
    server.listen(0, '127.0.0.1', mustCall(() => {
      // Keep producing spans while the agent enables tracing asynchronously.
      setInterval(() => {
        http.get(`http://127.0.0.1:${server.address().port}`, (res) => res.resume());
      }, 100);
    }));
  } else {
    setInterval(() => {}, 100);
  }
} else {
  for (const type of ['traces', 'metrics']) {
    const cases = [
      // Scheme, TLS, generic insecure override, signal insecure override.
      ['https://', true],
      ['https://', true, 'true', 'true'],
      ['HTTPS://', true],
      ['hTtPs://', true, 'true', 'true'],
      ['http://', false],
      ['HTTP://', false, 'false', 'false'],
      ['', true],
      ['', false, 'true'],
      ['', false, undefined, 'true'],
      ['', true, 'true', 'false'],
      ['', false, 'false', 'true'],
    ];
    for (const [scheme, tls, insecure, signalInsecure] of cases) {
      const context = JSON.stringify({ type, scheme, insecure, signalInsecure });
      const expected = tls ? Buffer.from([22, 3]) :
        Buffer.from('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n');
      // Inspect the wire so a plaintext HTTP/2 preface cannot pass as TLS.
      const server = net.createServer();
      const sockets = new Set();
      let child;
      let handshakeReceived = false;
      let step = 'server listening';
      const { promise: failed, reject } = Promise.withResolvers();
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${step}: ${context}`));
      }, platformTimeout(10000));
      try {
        server.listen(0, '127.0.0.1');
        await Promise.race([once(server, 'listening'), failed]);
        const handshake = new Promise((resolve) => {
          server.on('connection', mustCallAtLeast((socket) => {
            sockets.add(socket);
            socket.once('close', () => sockets.delete(socket));
            let received = Buffer.alloc(0);
            socket.on('data', mustCallAtLeast((data) => {
              received = Buffer.concat([received, data]);
              if (received.length < expected.length) return;
              try {
                assert.deepStrictEqual(received.subarray(0, expected.length),
                                       expected, context);
              } catch (err) {
                reject(err);
                return;
              }
              socket.removeAllListeners('data');
              handshakeReceived = true;
              socket.destroy();
              resolve();
            }));
          }));
        });
        const env = {
          NSOLID_OTLP: 'otlp',
          NSOLID_OTLP_CONFIG: JSON.stringify({
            url: `${scheme}127.0.0.1:${server.address().port}`,
            protocol: 'grpc',
          }),
          NSOLID_INTERVAL: '100',
          NSOLID_TRACING_ENABLED: type === 'traces' ? '1' : '0',
        };
        env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317';
        if (insecure !== undefined) {
          env.OTEL_EXPORTER_OTLP_INSECURE = insecure;
        }
        if (signalInsecure !== undefined) {
          env[`OTEL_EXPORTER_OTLP_${type.toUpperCase()}_INSECURE`] = signalInsecure;
        }
        child = fork(import.meta.filename, ['child', type], { env });
        const exited = once(child, 'exit').then(([code, signal]) => {
          assert(handshakeReceived,
                 `Child exited before handshake (${code}, ${signal}): ${context}`);
          return [code, signal];
        });
        step = 'handshake';
        timer.refresh();
        await Promise.race([handshake, exited, failed]);
        step = 'child exit';
        timer.refresh();
        // Exercise exporter shutdown after the collector rejects the export.
        if (child.connected) child.send('exit');
        const [code, signal] = await Promise.race([exited, failed]);
        assert.deepStrictEqual([code, signal], [0, null], context);
        step = 'server close';
        timer.refresh();
        await Promise.race([
          new Promise((resolve) => server.close(mustSucceed(resolve))),
          failed,
        ]);
      } finally {
        clearTimeout(timer);
        child?.kill('SIGKILL');
        for (const socket of sockets) socket.destroy();
        if (server.listening) server.close();
      }
    }
  }
}
