// Flags: --expose-internals
import { platformTimeout } from '../common/index.mjs';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  startCommandBackoffServer,
  status,
} from '../common/nsolid-grpc-agent/command-backoff.mjs';

for (const code of [status.OK, status.UNIMPLEMENTED,
                    status.INTERNAL, status.UNAVAILABLE]) {
  const { server, times, attempts, port } = await startCommandBackoffServer(code);
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
    assert.ok(times[1] - times[0] >= 200);
    assert.ok(times[2] - times[1] >= 400);
  } finally {
    clearTimeout(timeout);
    child.kill('SIGKILL');
    await exited;
    server.forceShutdown();
  }
}
