import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fixtures from '../common/fixtures.js';
import tmpdir from '../common/tmpdir.js';
import { GRPCServer } from '../common/nsolid-grpc-agent/index.js';

tmpdir.refresh();

const script = fixtures.path('nsolid-permission-audit.js');
const file = tmpdir.resolve('audited.txt');
const { writeFileSync } = await import('node:fs');
writeFileSync(file, 'nsolid');

function getEnv(port, extra = {}) {
  return {
    ...process.env,
    NSOLID_GRPC_INSECURE: 1,
    NSOLID_GRPC: `localhost:${port}`,
    ...extra,
  };
}

function checkCommon(msg, command, metadata) {
  assert.strictEqual(msg.common.command, command);
  assert.ok(BigInt(msg.common.recorded.seconds));
  assert.ok(BigInt(msg.body.timestamp) > 0n);
  assert.strictEqual(typeof metadata['nsolid-agent-id'][0], 'string');
}

// Each unique (permission, resource) pair is reported once per thread.
async function runBasic(execArgv, extraEnv) {
  return new Promise((resolve) => {
    const grpcServer = new GRPCServer();
    grpcServer.start(mustSucceed((port) => {
      const events = [];
      let child;
      const count = (threadId, permission, resource) => events.filter((e) => {
        return e.threadId === threadId && e.permission === permission &&
          (resource === undefined || e.resource === resource);
      }).length;

      grpcServer.on('permission_audit', ({ msg, metadata }) => {
        checkCommon(msg, 'permission_audit', metadata);
        events.push(msg.body);
        if (count('1', 'FileSystemRead', file) === 0)
          return;

        assert.strictEqual(count('0', 'FileSystemRead', file), 1);
        assert.strictEqual(count('1', 'FileSystemRead', file), 1);
        assert.strictEqual(
          count('0', 'FileSystemWrite', tmpdir.resolve('out.txt')), 1);
        assert.ok(count('0', 'ChildProcess') >= 1);
        assert.ok(count('0', 'WorkerThreads') >= 1);
        grpcServer.removeAllListeners('permission_audit');
        child.kill();
      });

      child = spawn(process.execPath,
                    [...execArgv, script, 'basic', file, tmpdir.path],
                    { stdio: 'inherit', env: getEnv(port, extraEnv) });
      child.on('exit', mustCall(() => {
        grpcServer.close();
        resolve();
      }));
    }));
  });
}

// A thread stops reporting after 1000 unique pairs.
async function runLimit(execArgv, extraEnv) {
  return new Promise((resolve) => {
    const grpcServer = new GRPCServer();
    grpcServer.start(mustSucceed((port) => {
      let mainThreadEvents = 0;
      grpcServer.on('permission_audit', ({ msg }) => {
        if (msg.body.threadId === '0')
          mainThreadEvents++;
      });

      grpcServer.on('permission_audit_limit', mustCall(({ msg, metadata }) => {
        checkCommon(msg, 'permission_audit_limit', metadata);
        assert.strictEqual(msg.body.threadId, '0');
        assert.strictEqual(msg.body.limit, 1000);
        assert.strictEqual(mainThreadEvents, 1000);
        child.kill();
      }));

      const child = spawn(process.execPath,
                          [...execArgv, script, 'limit', file, tmpdir.path],
                          { stdio: 'inherit', env: getEnv(port, extraEnv) });
      child.on('exit', mustCall(() => {
        grpcServer.close();
        resolve();
      }));
    }));
  });
}

// Without audit mode nothing is reported.
async function runNoAudit() {
  return new Promise((resolve) => {
    const grpcServer = new GRPCServer();
    grpcServer.start(mustSucceed((port) => {
      grpcServer.on('permission_audit', mustCall(0));
      grpcServer.on('permission_audit_limit', mustCall(0));
      grpcServer.on('exit', mustCall(() => {
        grpcServer.close();
        resolve();
      }));

      spawn(process.execPath,
            [script, 'basic', file, tmpdir.path, 'exit'],
            { stdio: 'inherit', env: getEnv(port) });
    }));
  });
}

const configs = [
  { name: 'NSOLID_PERMISSION_AUDIT', execArgv: [],
    env: { NSOLID_PERMISSION_AUDIT: '1' } },
  { name: '--permission-audit', execArgv: ['--permission-audit'], env: {} },
];

for (const { name, execArgv, env } of configs) {
  console.log(`[${name}] reports each violation once per thread`);
  await runBasic(execArgv, env);
  console.log(`[${name}] reports the limit of unique violations`);
  await runLimit(execArgv, env);
}

console.log('no events without audit mode');
await runNoAudit();
