// Flags: --expose-internals
import { mustCall, mustSucceed, sleepSync } from '../common/index.mjs';
import assert from 'node:assert';
import { fork } from 'node:child_process';
import binding from 'internal/test/binding';
import nsolid from 'nsolid';
import { GRPCServer } from '../common/nsolid-grpc-agent/index.js';

const { internalBinding } = binding;

if (process.argv[2] === 'child') {
  process.on('disconnect', () => process.exit(1));
  process.send(nsolid.id);
  let stopping = false;
  function block() {
    if (stopping) return;
    sleepSync(100);
    setImmediate(block);
  }
  setImmediate(block);
  process.once('message', mustCall(() => {
    stopping = true;
    if (process.argv[3] === 'stop') {
      const agent = internalBinding('nsolid_grpc_agent');
      assert.strictEqual(agent.stopForTesting(), 0);
      assert.strictEqual(agent.start(), internalBinding('uv').UV_ECANCELED);
      // Exercise both blocked and unblocked hooks after the native stop joined.
      sleepSync(100);
      setImmediate(() => {
        sleepSync(100);
        setImmediate(() => process.exit(0));
      });
    } else {
      // Exit while blocked/unblocked events can still be in flight.
      sleepSync(100);
      process.exit(0);
    }
  }));
} else {
  const server = new GRPCServer();
  const children = new Map();
  server.on('loop_blocked', (data) => {
    const id = data.metadata['nsolid-agent-id'][0];
    const child = children.get(id);
    if (child !== undefined) {
      children.delete(id);
      child.send('stop');
    }
  });
  server.start(mustSucceed((port) => {
    let remaining = 8;
    for (let i = 0; i < 8; i++) {
      const child = fork(import.meta.filename, ['child', i % 2 ? 'stop' : 'exit'], {
        env: {
          NSOLID_GRPC: `localhost:${port}`,
          NSOLID_GRPC_INSECURE: '1',
          NSOLID_BLOCKED_LOOP_THRESHOLD: '1',
        },
        stdio: ['ignore', 'inherit', 'pipe', 'ipc'],
      });
      let stderr = '';
      let id;
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (data) => { stderr += data; });
      child.once('message', mustCall((agentId) => {
        id = agentId;
        children.set(id, child);
      }));
      child.on('exit', mustCall((code, signal) => {
        if (--remaining === 0) server.close();
        assert.ok(id);
        assert.ok(!children.has(id), 'No blocked event received');
        assert.strictEqual(signal, null, stderr);
        assert.strictEqual(code, 0, stderr);
      }));
    }
  }));
}
