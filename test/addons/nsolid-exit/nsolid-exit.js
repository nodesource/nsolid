'use strict';
const common = require('../../common');
const assert = require('assert');
const cp = require('child_process');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);


if (process.argv[2] === 'child_exit_gracefully_0') {
  const binding = require(bindingPath);
  binding.setExitInfo(0, null, false);
  setTimeout(() => {}, 0);
  return;
}

if (process.argv[2] === 'child_exit_gracefully_25') {
  const binding = require(bindingPath);
  binding.setExitInfo(25, null, false);
  process.exitCode = 25;
  setTimeout(() => {}, 0);
  return;
}

if (process.argv[2] === 'child_process_exit_0') {
  const binding = require(bindingPath);
  binding.setExitInfo(0, null, false);
  process.exit(0);
}

if (process.argv[2] === 'child_process_exit_44') {
  const binding = require(bindingPath);
  binding.setExitInfo(44, null, false);
  process.exit(44);
}

if (process.argv[2] === 'child_throw_error') {
  const binding = require(bindingPath);
  binding.setExitInfo(
    1, ['Uncaught Error: My Error', 'Error: My Error'], false);
  throw new Error('My Error');
}

if (process.argv[2] === 'child_throw_error_on_uncaughtException') {
  const binding = require(bindingPath);
  binding.setExitInfo(
    7, ['Uncaught Error: Internal Error', 'Error: Internal Error'], false);
  process.on('uncaughtException', () => {
    throw new Error('Internal Error');
  });
  throw new Error('My Error');
}

if (process.argv[2] === 'child_bogus_process._fatalException') {
  const binding = require(bindingPath);
  binding.setExitInfo(
    6, ['Uncaught Error: My Error', 'Error: My Error'], false);
  process._fatalException = 42;
  throw new Error('My Error');
}

if (process.argv[2] === 'clearFatalError') {
  const nsolid = require('nsolid');
  const binding = require(bindingPath);
  // In this case, binding expected error will be nullptr.
  binding.setExitInfo(0, null, false);
  process.on('uncaughtException', (err) => {
    nsolid.saveFatalError(err);
    nsolid.clearFatalError();
  });
  throw new Error('My Error');
}

if (process.argv[2] === 'saveFatalError') {
  const nsolid = require('nsolid');
  const binding = require(bindingPath);
  binding.setExitInfo(
    0, ['My Error', 'Error: My Error'], false);
  process.on('uncaughtException', (err) => {
    nsolid.saveFatalError(err);
  });
  throw new Error('My Error');
}

if (process.argv[2] === 'child_sigint_signal') {
  const binding = require(bindingPath);
  binding.setExitInfo(2, null, true);
  setInterval(() => {}, 10000);
  process.send('ready');
  return;
}

const tests = [
  { name: 'child_exit_gracefully_0',
    code: 0,
    signal: null },
  { name: 'child_exit_gracefully_25',
    code: 25,
    signal: null },
  { name: 'child_process_exit_0',
    code: 0,
    signal: null },
  { name: 'child_process_exit_44',
    code: 44,
    signal: null },
  { name: 'child_throw_error',
    code: 1,
    signal: null },
  { name: 'child_throw_error_on_uncaughtException',
    code: 7,
    signal: null },
  { name: 'saveFatalError',
    code: 0,
    signal: null },
  { name: 'clearFatalError',
    code: 0,
    signal: null },
  { name: 'child_bogus_process._fatalException',
    code: 6,
    signal: null },
];

// Windows does not support SIGINT
if (!common.isWindows) {
  tests.push({
    name: 'child_sigint_signal',
    code: null,
    signal: 'SIGINT',
  });
}

tests.forEach(({ name, code, signal }) => {
  const child = cp.fork(__filename, [ name ], { stdio: 'pipe' });
  if (signal != null) {
    child.on('message', common.mustCall((m) => {
      assert.strictEqual(m, 'ready');
      child.kill(signal);
    }));
  }

  let stdout = '';
  child.stdout.on('data', (d) => {
    stdout += d;
  });

  child.on('close', common.mustCall(() => {
    assert.strictEqual(stdout, 'at_exit_hook');
  }));

  child.on('exit', common.mustCall((_code, _signal) => {
    assert.strictEqual(_code, code);
    assert.strictEqual(_signal, signal);
  }));
});
