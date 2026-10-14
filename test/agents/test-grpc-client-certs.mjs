// Flags: --expose-internals
import { canCreateSymLink, mustNotCall } from '../common/index.mjs';
import fixtures from '../common/fixtures.js';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  checkRpcMetadata,
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

// The server only accepts clients with a certificate issued by ca1.
const serverOpts = { tls: true, clientCa: 'ca1-cert.pem' };
const childOpts = (env) => ({ stdio: ['inherit', 'inherit', 'inherit', 'ipc'], env });

function baseEnv(port) {
  return {
    NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
    NSOLID_GRPC: `localhost:${port}`,
    NSOLID_GRPC_CERTS: fixtures.path('keys', 'selfsigned-no-keycertsign', 'cert.pem'),
    NSOLID_GRPC_CLIENT_CERT_REFRESH_INTERVAL: 2,
    NSOLID_INTERVAL: 100,
  };
}

function startServer(opts = {}) {
  return new Promise((resolve, reject) => {
    const grpcServer = new GRPCServer({ ...serverOpts, ...opts });
    grpcServer.start((err, port) => {
      if (err) {
        reject(err);
      } else if (opts.port && port !== Number(opts.port)) {
        reject(new Error(`gRPC server bound port ${port}, expected ${opts.port}`));
      } else {
        console.log(`[client-certs] gRPC server listening on ${port}`);
        resolve({ grpcServer, port });
      }
    });
  });
}

async function copyIdentity(dir, identity, cert = `${identity}-cert.pem`) {
  await mkdir(dir, { recursive: true });
  await Promise.all([
    copyFile(fixtures.path('keys', cert), path.join(dir, 'cert.pem')),
    copyFile(fixtures.path('keys', `${identity}-key.pem`), path.join(dir, 'key.pem')),
  ]);
}

function commandFrom(server, description) {
  return once(server, 'command', { signal: AbortSignal.timeout(10_000) })
    .catch((err) => {
      throw new Error(`Timed out waiting for ${description}`, { cause: err });
    });
}

function metricsFrom(server, description) {
  return once(server, 'metrics', { signal: AbortSignal.timeout(10_000) })
    .catch((err) => {
      throw new Error(`Timed out waiting for ${description}`, { cause: err });
    });
}

async function checkRecovery(condition = 'missing') {
  console.log(`[client-certs] recovery from ${condition} certificate files`);
  const invalidIdentity = condition !== 'missing';
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nsolid-client-certs-'));
  const certDir = path.join(dir, 'identity');
  const cert = path.join(certDir, 'cert.pem');
  const key = path.join(certDir, 'key.pem');
  if (invalidIdentity) {
    await copyIdentity(certDir, 'agent1');
    if (condition === 'malformed') {
      await writeFile(cert, '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----\n');
    } else {
      await copyFile(fixtures.path('keys', 'agent2-key.pem'), key);
    }
  }
  const { grpcServer, port } = await startServer();
  let child;
  try {
    const unexpectedConnection = mustNotCall('Authenticated before the certificate was repaired');
    if (invalidIdentity) {
      grpcServer.on('command', unexpectedConnection);
      grpcServer.on('metrics', unexpectedConnection);
    }
    const connection = Promise.all([
      commandFrom(grpcServer, 'recovery command stream'),
      metricsFrom(grpcServer, 'recovery metrics export'),
    ]);
    connection.catch(() => {});
    child = new TestClient([], childOpts({
      ...baseEnv(port),
      NSOLID_GRPC_CLIENT_CERT: cert,
      NSOLID_GRPC_CLIENT_KEY: key,
    }));
    const agentId = await child.id();
    await sleep(invalidIdentity ? 2500 : 1000);
    if (invalidIdentity) {
      assert.strictEqual(child.child().exitCode, null);
      assert.strictEqual(child.child().signalCode, null);
      grpcServer.off('command', unexpectedConnection);
      grpcServer.off('metrics', unexpectedConnection);
    }
    await copyIdentity(certDir, 'agent1');
    const [[{ agentId: streamAgentId, metadata, peer }], [{ peer: metricsPeer }]] =
      await connection;
    assert.strictEqual(streamAgentId, agentId);
    checkRpcMetadata(metadata, agentId);
    assert.strictEqual(peer, 'agent1');
    assert.strictEqual(metricsPeer, 'agent1');
    const exit = await child.shutdown(0);
    child = null;
    assert.strictEqual(exit.code, 0);
  } finally {
    if (child) {
      await child.shutdown(0);
    }
    await grpcServer.close();
    await rm(dir, { recursive: true, force: true });
  }
}

{
  console.log('[client-certs] the command stream and OTLP exports present the certificate');
  const { grpcServer, port } = await startServer();
  let child;
  try {
    // Listen before the agent starts: metrics may come before the command stream.
    const connection = Promise.all([
      commandFrom(grpcServer, 'initial agent1 command stream'),
      metricsFrom(grpcServer, 'initial agent1 metrics export'),
    ]);
    connection.catch(() => {});
    child = new TestClient([], childOpts({
      ...baseEnv(port),
      NSOLID_GRPC_CLIENT_CERT: fixtures.path('keys', 'agent1-cert.pem'),
      NSOLID_GRPC_CLIENT_KEY: fixtures.path('keys', 'agent1-key.pem'),
    }));
    const agentId = await child.id();
    const [[{ agentId: streamAgentId, metadata, peer }], [{ peer: metricsPeer }]] =
      await connection;
    assert.strictEqual(streamAgentId, agentId);
    checkRpcMetadata(metadata, agentId);
    assert.strictEqual(peer, 'agent1');
    assert.strictEqual(metricsPeer, 'agent1');
    const exit = await child.shutdown(0);
    child = null;
    assert.strictEqual(exit.code, 0);
  } finally {
    if (child) {
      await child.shutdown(0);
    }
    await grpcServer.close();
  }
}

await checkRecovery();
await checkRecovery('malformed');
await checkRecovery('mismatched');

{
  // gRPC's file watcher accepts files it cannot read as nothing loaded yet,
  // so the agent prints no warning of its own. gRPC's error log, which
  // reaches stderr by default, names the file instead.
  console.log('[client-certs] gRPC names a client certificate file it cannot read');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nsolid-client-certs-'));
  const key = path.join(dir, 'key.pem');
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    env: {
      ...process.env,
      ...baseEnv(1),
      GRPC_VERBOSITY: undefined,
      NSOLID_GRPC_CLIENT_CERT: path.join(dir, 'cert.pem'),
      NSOLID_GRPC_CLIENT_KEY: key,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No error in: ${stderr}`)), 10_000);
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
        if (stderr.includes(key)) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    assert.match(stderr, /Failed to get the file's modification time of .*key\.pem/);
  } finally {
    child.kill();
    await rm(dir, { recursive: true, force: true });
  }
}

async function checkRenewal(corrupt = '') {
  console.log(corrupt ?
    `[client-certs] an established connection survives ${corrupt} corruption and repair` :
    '[client-certs] a renewed certificate is used after reconnecting');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nsolid-client-certs-'));
  const identity1 = path.join(dir, 'agent1');
  const identity2 = path.join(dir, 'agent2');
  await copyIdentity(identity1, 'agent1');
  await copyIdentity(identity2, 'agent2', 'agent2-ca1-cert.pem');
  const current = path.join(dir, 'current');
  await symlink(identity1, current);

  let grpcServer;
  let child;
  let port;
  try {
    ({ grpcServer, port } = await startServer());
    const cert = path.join(current, 'cert.pem');
    const key = path.join(current, 'key.pem');
    const env = {
      ...baseEnv(port),
      NSOLID_GRPC_CLIENT_CERT: cert,
      NSOLID_GRPC_CLIENT_KEY: key,
    };
    let connection = Promise.all([
      commandFrom(grpcServer, 'initial agent1 command stream'),
      metricsFrom(grpcServer, 'initial agent1 metrics export'),
    ]);
    connection.catch(() => {});
    child = new TestClient([], childOpts(env));
    const agentId = await child.id();
    let [[{ agentId: streamAgentId, metadata, peer }], [{ peer: metricsPeer }]] =
      await connection;
    assert.strictEqual(streamAgentId, agentId);
    checkRpcMetadata(metadata, agentId);
    assert.strictEqual(peer, 'agent1');
    assert.strictEqual(metricsPeer, 'agent1');

    if (corrupt) {
      const unexpectedReconnect = mustNotCall(`Command stream reconnected during ${corrupt} corruption`);
      grpcServer.on('command', unexpectedReconnect);
      if (corrupt === 'private key') {
        await writeFile(key, '-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----\n');
      } else {
        await writeFile(cert, '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----\n');
      }
      await sleep(2500);
      const [{ peer: establishedPeer }] =
        await metricsFrom(grpcServer, `metrics on the established connection with a corrupt ${corrupt}`);
      assert.strictEqual(establishedPeer, 'agent1');
      assert.strictEqual(child.child().exitCode, null);
      assert.strictEqual(child.child().signalCode, null);
      grpcServer.off('command', unexpectedReconnect);

      console.log(`[client-certs] restarting server on ${port} while the ${corrupt} is corrupt`);
      await grpcServer.close();
      grpcServer = null;
      ({ grpcServer } = await startServer({ port }));
      const unexpectedAuthentication = mustNotCall(`Authenticated with a corrupt ${corrupt}`);
      grpcServer.on('command', unexpectedAuthentication);
      grpcServer.on('metrics', unexpectedAuthentication);
      await sleep(2500);
      assert.strictEqual(child.child().exitCode, null);
      assert.strictEqual(child.child().signalCode, null);
      grpcServer.off('command', unexpectedAuthentication);
      grpcServer.off('metrics', unexpectedAuthentication);
      connection = Promise.all([
        commandFrom(grpcServer, 'repaired agent2 command stream'),
        metricsFrom(grpcServer, 'repaired agent2 metrics export'),
      ]);
      connection.catch(() => {});
    }

    const next = path.join(dir, 'current-next');
    await symlink(identity2, next);
    await rename(next, current);
    await sleep(2500);

    if (!corrupt) {
      console.log(`[client-certs] restarting server on ${port} after certificate refresh`);
      await grpcServer.close();
      grpcServer = null;
      ({ grpcServer } = await startServer({ port }));
      connection = Promise.all([
        commandFrom(grpcServer, 'renewed agent2 command stream'),
        metricsFrom(grpcServer, 'renewed agent2 metrics export'),
      ]);
      connection.catch(() => {});
    }
    [[{ agentId: streamAgentId, metadata, peer }], [{ peer: metricsPeer }]] =
      await connection;
    assert.strictEqual(streamAgentId, agentId);
    checkRpcMetadata(metadata, agentId);
    assert.strictEqual(peer, 'agent2');
    assert.strictEqual(metricsPeer, 'agent2');

    const exit = await child.shutdown(0);
    child = null;
    assert.strictEqual(exit.code, 0);
  } finally {
    if (child) {
      await child.shutdown(0);
    }
    if (grpcServer) {
      await grpcServer.close();
    }
    await rm(dir, { recursive: true, force: true });
  }
}

if (canCreateSymLink()) {
  await checkRenewal();
  await checkRenewal('certificate');
  await checkRenewal('private key');
} else {
  console.log('[client-certs] skipping renewal test: symlinks are not supported');
}

const refused = [
  ['without a certificate', {}],
  ['with a certificate from another CA', {
    NSOLID_GRPC_CLIENT_CERT: fixtures.path('keys', 'agent3-cert.pem'),
    NSOLID_GRPC_CLIENT_KEY: fixtures.path('keys', 'agent3-key.pem'),
  }],
  // Half a configuration is ignored, with a warning.
  ['with a certificate and no key', {
    NSOLID_GRPC_CLIENT_CERT: fixtures.path('keys', 'agent1-cert.pem'),
  }],
];

for (const [name, env] of refused) {
  console.log(`[client-certs] an agent ${name} is refused`);
  const { grpcServer, port } = await startServer();
  grpcServer.on('command', mustNotCall());
  grpcServer.on('metrics', mustNotCall());
  const child = new TestClient([], childOpts({ ...baseEnv(port), ...env }));
  await child.id();
  await sleep(2000);
  const exit = await child.shutdown(0);
  assert.strictEqual(exit.code, 0);
  grpcServer.close();
}
