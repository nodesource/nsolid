// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import { GRPCServer } from '../common/nsolid-grpc-agent/index.js';

if (process.argv[2] === 'child') {
  const interval = setInterval(() => {}, 100);
  process.on('message', mustCall(() => {
    // Let the queued stop callback finish before releasing the singleton.
    setTimeout(() => {
      clearInterval(interval);
      process.disconnect();
    }, 500);
  }));
} else {
  const server = new GRPCServer({ rejectAuth: true });
  server.start(mustSucceed((port) => {
    const child = fork(import.meta.filename, ['child'], {
      env: {
        NSOLID_GRPC: `localhost:${port}`,
        NSOLID_GRPC_INSECURE: '1',
      },
      stdio: ['ignore', 'inherit', 'pipe', 'ipc'],
    });
    let stderr = '';
    let unauthorized = false;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (data) => {
      stderr += data;
      if (!unauthorized && stderr.includes('Unable to authenticate')) {
        unauthorized = true;
        child.send('exit');
      }
    });
    child.on('exit', mustCall((code, signal) => {
      server.close();
      assert.strictEqual(unauthorized, true, stderr);
      assert.strictEqual(signal, null, stderr);
      assert.strictEqual(code, 0, stderr);
    }));
  }));
}
