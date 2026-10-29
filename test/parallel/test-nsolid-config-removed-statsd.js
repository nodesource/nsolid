'use strict';

const common = require('../common');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const tmpdir = require('../common/tmpdir');

const removed = { statsd: 'secret', statsdBucket: 'secret', statsdTags: 'secret' };

function check(env, config, keys = [], setup = '') {
  const script = config === undefined ?
    `setTimeout(() => {}, ${common.platformTimeout(100)});` :
    `const nsolid = require('nsolid');
     nsolid.start(${JSON.stringify(config)});
     nsolid.start(${JSON.stringify(config)});`;
  const result = spawnSync(process.execPath, ['-e', setup + script], {
    env: { NSOLID_PACKAGE_JSON: '', ...env },
    encoding: 'utf8',
    timeout: common.platformTimeout(15000),
  });
  assert.ifError(result.error);
  assert.strictEqual(result.status, 0,
                     `signal=${result.signal}, stderr=${result.stderr}`);
  assert.strictEqual(result.stderr.split('[NSOLID_STATSD_REMOVED]').length - 1,
                     keys.length ? 1 : 0);
  if (keys.length) {
    for (const key of keys)
      assert.ok(result.stderr.includes(key));
    assert.ok(result.stderr.includes('Use NSOLID_OTLP'));
    assert.doesNotMatch(result.stderr, /secret/);
  }
}

// Ignored options must not invoke getters for their values.
check({}, undefined, ['statsd'],
      "require('nsolid').start({ get statsd() { throw new Error('secret'); } });");
check({}, undefined, ['statsd'],
      "require('nsolid').start(Object.create({ statsd: 'secret' }));");
check({}, undefined, ['statsd'],
      "require('nsolid').start(Object.create({ get statsd() { throw new Error('secret'); } }));");
check({}, undefined, [], 'delete Array.prototype[Symbol.iterator];');

check({}, undefined);
check({ NSOLID_STATSD: '' }, undefined);
for (const key of ['NSOLID_STATSD', 'NSOLID_STATSD_BUCKET', 'NSOLID_STATSD_TAGS']) {
  check({ [key]: 'secret' }, undefined, [key]);
}
for (const [key, value] of Object.entries(removed)) {
  check({}, { [key]: value }, [key]);
}
check({ NSOLID_STATSD: 'secret' }, removed, ['NSOLID_STATSD', ...Object.keys(removed)]);

tmpdir.refresh();
const packagePath = join(tmpdir.path, 'package.json');
for (const key of Object.keys(removed)) {
  writeFileSync(packagePath, JSON.stringify({ nsolid: { [key]: 'secret' } }));
  check({ NSOLID_PACKAGE_JSON: packagePath }, undefined, [key]);
}
