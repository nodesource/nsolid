// Flags: --expose-internals
import { mustNotCall, mustSucceed } from '../common/index.mjs';
import fixtures from '../common/fixtures.js';
import assert from 'node:assert';
import { once } from 'node:events';
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
    NSOLID_INTERVAL: 100,
  };
}

function startServer() {
  return new Promise((resolve) => {
    const grpcServer = new GRPCServer(serverOpts);
    grpcServer.start(mustSucceed((port) => resolve({ grpcServer, port })));
  });
}

{
  console.log('[client-certs] the command stream and OTLP exports present the certificate');
  const { grpcServer, port } = await startServer();
  // Listen before the agent starts: metrics may come before the command stream.
  const command = once(grpcServer, 'command');
  const metrics = once(grpcServer, 'metrics');
  const child = new TestClient([], childOpts({
    ...baseEnv(port),
    NSOLID_GRPC_CLIENT_CERT: fixtures.path('keys', 'agent1-cert.pem'),
    NSOLID_GRPC_CLIENT_KEY: fixtures.path('keys', 'agent1-key.pem'),
  }));
  const agentId = await child.id();
  const [{ agentId: streamAgentId, metadata, peer }] = await command;
  assert.strictEqual(streamAgentId, agentId);
  checkRpcMetadata(metadata, agentId);
  assert.strictEqual(peer, 'agent1');
  // The server refuses clients without a certificate, so these came with it.
  await metrics;
  const exit = await child.shutdown(0);
  assert.strictEqual(exit.code, 0);
  grpcServer.close();
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
