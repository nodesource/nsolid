'use strict';

const common = require('../../common');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const { Worker } = require('node:worker_threads');

if (process.argv[2] === 'child') {
  require('nsolid').start({ ebpfProfiling: false });
  const binding = require(`./build/${common.buildType}/binding`);
  binding.registerExitCodeEventHook();
  const explicit = process.argv[4] === 'explicit';
  const finish = () => {
    console.log('exiting');
    if (explicit)
      process.exit(0);
  };

  if (process.argv[3] === 'worker') {
    const worker = new Worker(`
      setTimeout(() => {
        ${explicit ? 'process.exit(0);' : ''}
      }, 100);
    `, { eval: true });
    worker.on('exit', common.mustCall((code) => {
      assert.strictEqual(code, 0);
      finish();
    }));
  } else {
    setTimeout(common.mustCall(finish), 100);
  }
  return;
}

for (const thread of ['main', 'worker']) {
  for (const mode of ['natural', 'explicit']) {
    const result = spawnSync(process.execPath,
                             [__filename, 'child', thread, mode], {
                               encoding: 'utf8',
                               timeout: common.platformTimeout(10000),
                               killSignal: 'SIGKILL',
                             });
    assert.ifError(result.error);
    assert.strictEqual(result.signal, null, result.stderr);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /exiting/);
  }
}
