import { mustCall } from '../common/index.mjs';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import fixtures from '../common/fixtures.js';
import tmpdir from '../common/tmpdir.js';
import ZmqAgentBus from '../common/nsolid-zmq-agent/zmqagentbus.js';

tmpdir.refresh();

const script = fixtures.path('nsolid-permission-audit.js');
const file = tmpdir.resolve('audited.txt');
writeFileSync(file, 'nsolid');

const config = {
  commandBindAddr: 'tcp://*:9001',
  dataBindAddr: 'tcp://*:9002',
  bulkBindAddr: 'tcp://*:9003',
  HWM: 0,
  bulkHWM: 0,
  commandTimeoutMilliseconds: 5000,
  saas: false,
};

const bus = new ZmqAgentBus(config);
await new Promise((resolve, reject) => {
  bus.start((err) => (err ? reject(err) : resolve()));
});

function spawnChild(execArgv, extraEnv, args) {
  return spawn(process.execPath, [...execArgv, script, ...args], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NSOLID_COMMAND: 9001,
      NSOLID_PUBKEY: bus.server.keyPair.public,
      ...extraEnv,
    },
  });
}

function checkMessage(data, command) {
  assert.strictEqual(data.command, command);
  assert.strictEqual(data.requestId, null);
  assert.ok(data.body.timestamp > 0);
}

// Each unique (permission, resource) pair is reported once per thread.
function runBasic(execArgv, extraEnv) {
  return new Promise((resolve) => {
    const events = [];
    const count = (threadId, permission, resource) => events.filter((e) => {
      return e.threadId === threadId && e.permission === permission &&
        (resource === undefined || e.resource === resource);
    }).length;

    const child = spawnChild(execArgv, extraEnv,
                             ['basic', file, tmpdir.path]);
    bus.on('agent-permission_audit', (agentId, data) => {
      checkMessage(data, 'permission_audit');
      events.push(data.body);
      if (count(1, 'FileSystemRead', file) === 0)
        return;

      assert.strictEqual(count(0, 'FileSystemRead', file), 1);
      assert.strictEqual(count(1, 'FileSystemRead', file), 1);
      assert.strictEqual(
        count(0, 'FileSystemWrite', tmpdir.resolve('out.txt')), 1);
      assert.ok(count(0, 'ChildProcess') >= 1);
      assert.ok(count(0, 'WorkerThreads') >= 1);
      bus.removeAllListeners('agent-permission_audit');
      child.kill();
    });
    child.on('exit', mustCall(resolve));
  });
}

// A thread stops reporting after 1000 unique pairs.
function runLimit(execArgv, extraEnv) {
  return new Promise((resolve) => {
    let mainThreadEvents = 0;
    const child = spawnChild(execArgv, extraEnv,
                             ['limit', file, tmpdir.path]);
    bus.on('agent-permission_audit', (agentId, data) => {
      if (data.body.threadId === 0)
        mainThreadEvents++;
    });
    bus.once('agent-permission_audit_limit', mustCall((agentId, data) => {
      checkMessage(data, 'permission_audit_limit');
      assert.strictEqual(data.body.threadId, 0);
      assert.strictEqual(data.body.limit, 1000);
      assert.strictEqual(mainThreadEvents, 1000);
      bus.removeAllListeners('agent-permission_audit');
      child.kill();
    }));
    child.on('exit', mustCall(resolve));
  });
}

// Without audit mode nothing is reported.
function runNoAudit() {
  return new Promise((resolve) => {
    bus.on('agent-permission_audit', mustCall(0));
    bus.on('agent-permission_audit_limit', mustCall(0));
    bus.once('agent-exit', mustCall(() => {
      bus.removeAllListeners('agent-permission_audit');
      bus.removeAllListeners('agent-permission_audit_limit');
      resolve();
    }));
    spawnChild([], {}, ['basic', file, tmpdir.path, 'exit']);
  });
}

const configs = [
  { name: 'NSOLID_PERMISSION_AUDIT', execArgv: [],
    env: { NSOLID_PERMISSION_AUDIT: 'true' } },
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

await new Promise((resolve) => bus.shutdown(resolve));
