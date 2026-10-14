// Flags: --expose-internals
import { platformTimeout } from '../common/index.mjs';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const definition = await protoLoader.load('nsolid_service.proto', {
  includeDirs: [
    path.resolve(import.meta.dirname, '../../agents/grpc/proto'),
    path.resolve(import.meta.dirname,
                 '../../deps/opentelemetry-cpp/third_party/opentelemetry-proto'),
  ],
});
const { grpcagent } = grpc.loadPackageDefinition(definition);
for (const code of [grpc.status.OK, grpc.status.UNIMPLEMENTED,
                    grpc.status.INTERNAL, grpc.status.UNAVAILABLE]) {
  const server = new grpc.Server();
  const times = [];
  let complete;
  const attempts = new Promise((resolve) => { complete = resolve; });
  server.addService(grpcagent.NSolidService.service, {
    Command(call) {
      times.push(performance.now());
      console.log(`Command close status=${code}, attempt=${times.length}`);
      call.on('error', () => {});
      if (code === grpc.status.OK) call.end();
      else call.destroy({ code, details: 'retry test' });
      if (times.length === 3) complete();
    },
  });
  const port = await new Promise((resolve, reject) => {
    server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(),
                     (err, port) => (err ? reject(err) : resolve(port)));
  });
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    env: { ...process.env, NSOLID_GRPC: `127.0.0.1:${port}`,
           NSOLID_GRPC_INSECURE: '1', NSOLID_SAAS: '',
           NODE_DEBUG_NATIVE: 'nsolid_grpc_agent' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('error', (err) => { throw err; });
  const exited = once(child, 'exit');
  let timeout;
  const deadline = new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for command retries: ${code}`));
    }, platformTimeout(15000));
  });
  try {
    await Promise.race([attempts, deadline]);
    assert.ok(times[1] - times[0] >= 300);
    assert.ok(times[2] - times[1] >= 600);
  } finally {
    clearTimeout(timeout);
    child.kill('SIGKILL');
    await exited;
    server.forceShutdown();
  }
}
