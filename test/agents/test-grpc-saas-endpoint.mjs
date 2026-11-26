// Flags: --expose-internals
import { platformTimeout, mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import fixtures from '../common/fixtures.js';
import tmpdir from '../common/tmpdir.js';
import assert from 'node:assert';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { GRPCServer, TestClient } from '../common/nsolid-grpc-agent/index.js';

// Synthetic credentials; the token endpoint deliberately differs from the override.
const token = (key = 'a', host = 'console.example') =>
  `${key.repeat(40)}${'b'.repeat(36)}.${host}:443`;
const timeout = platformTimeout(15000);
tmpdir.refresh();

async function startServer(tls = true) {
  const server = new GRPCServer({ tls, observeMetadata: true,
                                  stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const port = await new Promise((resolve) => server.start(mustSucceed(resolve)));
  return { server, port };
}

function rpc(server, method, saas) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.off('rpc', listener);
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeout);
    function listener({ method: path, metadata }) {
      if (!path.endsWith(method) || metadata['nsolid-saas']?.[0] !== saas)
        return;
      clearTimeout(timer);
      server.off('rpc', listener);
      resolve();
    }
    server.on('rpc', listener);
  });
}

async function exportsFrom(server, child, saas) {
  const received = Promise.all([
    rpc(server, 'MetricsService/Export', saas),
    rpc(server, 'LogsService/Export', saas),
    rpc(server, 'TraceService/Export', saas),
  ]);
  received.catch(() => {});
  await child.enableTraces();
  await child.log(0, 'info', 'endpoint regression');
  await child.trace('custom');
  await received;
}

function childOptions(env = {}) {
  return {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    serialization: 'advanced',
    env: {
      NSOLID_GRPC_CERTS: fixtures.path('keys', 'selfsigned-no-keycertsign', 'cert.pem'),
      // A real token must ignore this flag and still reach the TLS-only server.
      NSOLID_GRPC_INSECURE: '1',
      NSOLID_INTERVAL: '100',
      NODE_DEBUG_NATIVE: 'nsolid_grpc_agent,nsolid_otlp_agent',
      grpc_proxy: 'http://127.0.0.1:1',
      no_grpc_proxy: 'localhost,127.0.0.1',
      ...env,
    },
  };
}

test('token-only production and staging endpoints stay unchanged', () => {
  for (const staging of [false, true]) {
    const result = spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 250)'], {
      env: {
        NSOLID_SAAS: token('a', staging ? 'staging.example' : 'console.example'),
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        grpc_proxy: 'http://127.0.0.1:1',
      },
      encoding: 'utf8', timeout,
    });
    assert.ok(!result.error, 'Token-only child failed');
    assert.strictEqual(result.status, 0,
                       `signal=${result.signal}, stderr=${result.stderr}`);
    const endpoint = `${'b'.repeat(36)}.grpc.${staging ? 'staging.' : ''}nodesource.io:443`;
    assert.ok(result.stderr.includes(`Endpoint: ${endpoint}. Insecure: 0`));
  }
});

test('a portless address keeps the default port only without a token', () => {
  for (const [grpc, saas, endpoint] of [
    ['console.example', undefined, 'console.example'],
    ['[::1]', undefined, '[::1]'],
    ['console.example', token(), 'console.example:443'],
    ['[::1]', token(), '[::1]:443'],
    ['console.example:80', token(), 'console.example:80'],
  ]) {
    const env = {
      NSOLID_GRPC: grpc,
      NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
      grpc_proxy: 'http://127.0.0.1:1',
    };
    if (saas)
      env.NSOLID_SAAS = saas;
    const result = spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 250)'], {
      env, encoding: 'utf8', timeout,
    });
    assert.ok(!result.error, 'Child failed');
    assert.strictEqual(result.status, 0,
                       `signal=${result.signal}, stderr=${result.stderr}`);
    assert.ok(result.stderr.includes(`Endpoint: ${endpoint}. `),
              `${grpc} with${saas ? '' : 'out'} a token: ${result.stderr}`);
  }
});

for (const source of ['env', 'package', 'js']) {
  test(`saas and grpc from ${source} use TLS and metadata`, async () => {
    const { server, port } = await startServer();
    const saas = token();
    let child;
    let stderr = '';
    const methods = new Set();
    server.on('rpc', mustCallAtLeast(({ method, metadata }) => {
      // Do not include credentials in assertion diagnostics.
      assert.ok(metadata['nsolid-saas']?.[0] === saas, `Missing token on ${method}`);
      methods.add(method);
    }));
    try {
      const env = { NSOLID_OTLP: 'otlp' };
      if (source === 'env') {
        env.NSOLID_GRPC = String(port);
        env.NSOLID_SAAS = saas;
      } else if (source === 'package') {
        const pkg = join(tmpdir.path, 'package.json');
        writeFileSync(pkg, JSON.stringify({ nsolid: { grpc: port, saas } }));
        env.NSOLID_PACKAGE_JSON = pkg;
      }
      const command = rpc(server, 'Command', saas);
      command.catch(() => {});
      child = new TestClient([], childOptions(env));
      child.child().stderr.setEncoding('utf8');
      child.child().stderr.on('data', (data) => { stderr += data; });
      await child.id();
      if (source === 'js')
        await child.config({ grpc: port, saas });
      await command;
      const config = await child.config();
      assert.strictEqual(config.grpc, `localhost:${port}`);
      await exportsFrom(server, child, saas);
      const exit = rpc(server, 'ExportExit', saas);
      assert.strictEqual((await child.shutdown(0)).code, 0);
      child = null;
      await exit;
      for (const service of ['MetricsService', 'LogsService', 'TraceService']) {
        assert.ok([...methods].some((method) => method.includes(`.${service}/Export`)), service);
      }
      assert.ok(!stderr.includes(saas.slice(0, 40)), 'Credential leaked to stderr');
    } finally {
      if (child) await child.kill();
      await server.close();
    }
  });
}

const kRejectedWarning = 'N|Solid warning: invalid grpc address; ' +
                         'not connecting to the N|Solid Console';
const kNotConnecting = 'GrpcAgent not connecting: invalid grpc address';

function collectStderr(child) {
  const output = { text: '' };
  child.child().stderr.setEncoding('utf8');
  child.child().stderr.on('data', (data) => { output.text += data; });
  return output;
}

function waitForStderr(child, output, text, offset = 0) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.child().stderr.off('data', check);
      reject(new Error(`Timed out waiting for "${text}"`));
    }, timeout);
    function check() {
      if (!output.text.slice(offset).includes(text))
        return;
      clearTimeout(timer);
      child.child().stderr.off('data', check);
      resolve();
    }
    child.child().stderr.on('data', check);
    check();
  });
}

test('rejected grpc addresses connect nowhere, even with a token', async () => {
  const { server, port } = await startServer();
  // A testing token whose own endpoint is the local server: any fallback to it
  // shows up as an RPC.
  const saas = token('a', `testing.localhost:${port}`).replace(/:443$/, '');
  const rpcs = [];
  server.on('rpc', ({ method }) => rpcs.push(method));
  let child;
  try {
    const cases = [
      // Package values other than a missing or empty one must be valid, not
      // unset: 0 and false don't fall back to the token's endpoint.
      ...[['host:443'], { host: 'localhost' }, true, false, 0].map((grpc) => ({ package: { grpc, saas } })),
      { env: { NSOLID_GRPC: 'localhost:70000', NSOLID_SAAS: saas } },
      { env: { NSOLID_GRPC: 'bad host:1', NSOLID_SAAS: saas } },
      ...[`${saas.slice(0, 40)}@localhost:${port}`,
          `localhost:${port}/path`, `localhost:${port}/`,
          `localhost:${port}?query`, `localhost:${port}#fragment`].flatMap((grpc) => [
        { env: { NSOLID_GRPC: grpc, NSOLID_SAAS: saas } },
        { package: { grpc, saas } },
        { env: { NSOLID_DELAY_INIT: '60000' }, config: { grpc, saas } },
      ]),
      { env: { NSOLID_GRPC: 'bad host:1', NSOLID_SAAS: saas,
               NSOLID_DELAY_INIT: '60000' }, config: { grpc: undefined } },
      { package: { grpc: 'bad host:1', saas },
        env: { NSOLID_DELAY_INIT: '60000' }, config: { grpc: undefined } },
    ];
    for (const { package: pkgConfig, env = {}, config: startupConfig } of cases) {
      if (pkgConfig) {
        const pkg = join(tmpdir.path, 'invalid-package.json');
        writeFileSync(pkg, JSON.stringify({ nsolid: pkgConfig }));
        env.NSOLID_PACKAGE_JSON = pkg;
      }
      child = new TestClient([], childOptions({
        ...env, NSOLID_GRPC_INSECURE: '0', NSOLID_OTLP: 'otlp',
        NSOLID_BLOCKED_LOOP_THRESHOLD: '50',
      }));
      const stderr = collectStderr(child);
      await child.id();
      if (startupConfig)
        await child.config(startupConfig);
      await waitForStderr(child, stderr, kNotConnecting);
      const config = await child.config();
      // The marker stays internal so nsolid.start(nsolid.config) can't unset it.
      assert.strictEqual(config.grpc, undefined);
      assert.strictEqual(config.otlp, 'otlp');
      // Blocked-loop events must be dropped, not sent through a missing stub.
      await child.block(0, 200);
      await child.log(0, 'info', 'not connected');
      // Assets have nowhere to go: they must be dropped without crashing, and
      // an in-flight profile mustn't keep the exit waiting.
      await child.snapshot();
      await child.profile(5000);
      assert.strictEqual((await child.shutdown(0)).code, 0);
      child = null;
      assert.ok(stderr.text.includes(kRejectedWarning), 'Missing warning');
      assert.ok(!stderr.text.includes(saas.slice(0, 40)), 'Credential leaked to stderr');
      assert.ok(!stderr.text.includes('Endpoint:'), 'Clients were configured');
    }
    assert.deepStrictEqual(rpcs, []);
  } finally {
    if (child) await child.kill();
    await server.close();
  }
});

test('a rejected runtime address disconnects instead of using the token endpoint', async () => {
  const first = await startServer();
  const fallback = await startServer();
  const saas = token('a', `testing.localhost:${fallback.port}`).replace(/:443$/, '');
  const fallbackRpcs = [];
  fallback.server.on('rpc', ({ method }) => fallbackRpcs.push(method));
  const exits = [];
  first.server.on('rpc', ({ method }) => {
    if (method.endsWith('ExportExit')) exits.push(method);
  });
  let child;
  try {
    const command = rpc(first.server, 'Command', saas);
    command.catch(() => {});
    child = new TestClient([], childOptions({
      NSOLID_GRPC: `localhost:${first.port}`, NSOLID_SAAS: saas,
      NSOLID_GRPC_INSECURE: '0',
    }));
    const stderr = collectStderr(child);
    await child.id();
    await command;
    for (const grpc of ['bad host:1', 'localhost:70000',
                        `${saas.slice(0, 40)}@localhost:${first.port}`,
                        `localhost:${first.port}/path`]) {
      const offset = stderr.text.length;
      await child.config({ grpc });
      await waitForStderr(child, stderr, kRejectedWarning, offset);
      await waitForStderr(child, stderr, kNotConnecting);
      assert.ok(stderr.text.slice(offset).includes(kRejectedWarning), 'Missing warning');
      assert.strictEqual((await child.config()).grpc, undefined);
    }
    // Round-tripping the visible config must not unset the rejected address.
    await child.config(await child.config());
    await child.log(0, 'info', 'not connected');
    assert.strictEqual((await child.shutdown(0)).code, 0);
    child = null;
    assert.deepStrictEqual(fallbackRpcs, []);
    assert.deepStrictEqual(exits, []);
  } finally {
    if (child) await child.kill();
    await first.server.close();
    await fallback.server.close();
  }
});

for (const tls of [false, true]) {
  test(`token-only and address-only compatibility, TLS=${tls}`, async () => {
    const { server, port } = await startServer(tls);
    const saas = token('a', `testing.localhost:${port}`).replace(/:443$/, '');
    let child;
    try {
      for (const env of [
        { NSOLID_SAAS: saas },
        { NSOLID_GRPC: `localhost:${port}` },
        { NSOLID_SAAS: saas, NSOLID_GRPC: `localhost:${port}` },
      ]) {
        const expected = env.NSOLID_SAAS;
        const checkMetadata = mustCallAtLeast(({ method, metadata }) => {
          assert.ok(metadata['nsolid-saas']?.[0] === expected, `Wrong token on ${method}`);
        });
        server.on('rpc', checkMetadata);
        const command = rpc(server, 'Command', expected);
        command.catch(() => {});
        child = new TestClient([], childOptions({
          ...env, NSOLID_GRPC_INSECURE: tls ? '0' : '1',
        }));
        child.child().stderr.resume();
        await child.id();
        await command;
        await exportsFrom(server, child, expected);
        assert.strictEqual((await child.shutdown(0)).code, 0);
        child = null;
        server.off('rpc', checkMetadata);
      }
    } finally {
      if (child) await child.kill();
      await server.close();
    }
  });
}

test('runtime address and token transitions refresh clients and metadata', async () => {
  const first = await startServer();
  const second = await startServer();
  const saas = token();
  const rotated = token('c');
  const fallback = token('d', `testing.localhost:${first.port}`).replace(/:443$/, '');
  let child;
  try {
    let command = rpc(first.server, 'Command', undefined);
    command.catch(() => {});
    child = new TestClient([], childOptions({
      NSOLID_GRPC: `localhost:${first.port}`, NSOLID_GRPC_INSECURE: '0',
    }));
    child.child().stderr.resume();
    await child.id();
    await command;
    for (const [target, config, expected] of [
      [first, { saas }, saas],
      [second, { grpc: `localhost:${second.port}` }, saas],
      [second, { grpc: undefined, saas: rotated }, rotated],
      [second, { saas: null }, undefined],
      [second, { saas: fallback }, fallback],
      [first, { grpc: null }, fallback],
      [second, { grpc: `localhost:${second.port}` }, fallback],
      [first, { grpc: 0 }, fallback],
      [second, { grpc: `localhost:${second.port}` }, fallback],
      [first, { grpc: false }, fallback],
      [second, { grpc: `localhost:${second.port}` }, fallback],
      [first, { grpc: '' }, fallback],
      [second, { grpc: `localhost:${second.port}`, saas }, saas],
    ]) {
      command = rpc(target.server, 'Command', expected);
      command.catch(() => {});
      await child.config(config);
      await command;
      await exportsFrom(target.server, child, expected);
    }
    assert.strictEqual((await child.shutdown(0)).code, 0);
    child = null;
  } finally {
    if (child) await child.kill();
    await first.server.close();
    await second.server.close();
  }
});
