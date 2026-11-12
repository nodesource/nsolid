// Flags: --expose-internals
import { mustCall, mustSucceed, sleepSync } from '../common/index.mjs';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import binding from 'internal/test/binding';
import nsolid from 'nsolid';
import { GRPCServer } from '../common/nsolid-grpc-agent/index.js';

const { internalBinding } = binding;

if (process.argv[2] === 'child') {
  const interval = setInterval(() => {}, 100);
  process.on('message', mustCall(() => {
    // Let the queued stop callback finish before using the stopped agent.
    setTimeout(mustCall(() => {
      if (process.argv[3] === 'blocked-loop') {
        sleepSync(300);
      } else if (process.argv[3] === 'profile') {
        for (const method of ['profile', 'heapProfile', 'heapSampling', 'snapshot']) {
          assert.throws(() => nsolid[method](), { code: 404 });
        }
      } else if (process.argv[3] === 'restart') {
        nsolid.start({ tags: ['x'] });
        assert.strictEqual(internalBinding('nsolid_grpc_agent').start(),
                           internalBinding('uv').UV_ECANCELED);
      } else {
        for (let i = 0; i < 10; i++) nsolid.logger.info('after give-up');
        const worker = new Worker(`
          require('nsolid').logger.info('after give-up');
        `, { eval: true });
        worker.on('exit', mustCall((code) => assert.strictEqual(code, 0)));
      }
      // Allow the unblocked-loop hook to run before exiting.
      setTimeout(() => {
        clearInterval(interval);
        process.disconnect();
      }, 500);
    }), 500);
  }));
} else {
  const server = new GRPCServer({ rejectAuth: true });
  server.start(mustSucceed((port) => {
    const scenarios = ['blocked-loop', 'profile', 'restart', 'logs-and-workers'];
    let remaining = scenarios.length;
    for (const scenario of scenarios) {
      const child = fork(import.meta.filename, ['child', scenario], {
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
        if (--remaining === 0) server.close();
        assert.strictEqual(unauthorized, true, stderr);
        assert.strictEqual(signal, null, stderr);
        assert.strictEqual(code, 0, stderr);
      }));
    }
  }));
}
