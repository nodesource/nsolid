// Flags: --expose-internals
'use strict';

const common = require('../common');
const assert = require('assert');
const { isMainThread } = require('worker_threads');
if (!isMainThread)
  common.skip('This test only works on a main thread');

const { spawnSync } = require('child_process');
const { writeFileSync } = require('fs');
const { join } = require('path');
const tmpdir = require('../common/tmpdir');
const nsolid = require('nsolid');

const keys = [
  'assetsEnabled', 'contCpuProfile', 'disablePackageScan',
  'disableSnapshots', 'iisNode', 'pauseMetrics', 'promiseTracking',
  'redactSnapshots', 'sourceCodeEnabled',
  'tracingEnabled', 'trackGlobalPackages',
];

// Invalid updates must preserve both true and false, including on first start.
const initial = nsolid.config;
nsolid.start({ assetsEnabled: '', contCpuProfile: '', promiseTracking: null });
assert.strictEqual(nsolid.config.assetsEnabled, initial.assetsEnabled);
assert.strictEqual(nsolid.config.contCpuProfile, initial.contCpuProfile);
assert.strictEqual(nsolid.config.promiseTracking, initial.promiseTracking);
for (const key of keys) {
  for (const previous of [false, true]) {
    nsolid.start({ [key]: previous });
    for (const value of ['', null, undefined, {}, []]) {
      nsolid.start({ [key]: value });
      assert.strictEqual(nsolid.config[key], previous, key);
    }
  }
  // Preserve optionToBool's existing nonempty-string and numeric semantics.
  for (const [value, expected] of [
    [false, false], [true, true], [0, false], [1, true], [-1, true],
    ['0', false], ['false', false], ['true', true], ['x', true],
  ]) {
    nsolid.start({ [key]: value });
    assert.strictEqual(nsolid.config[key], expected, key);
  }
  nsolid.start({ [key]: false });
}

const previous = JSON.stringify(nsolid.config);
for (const config of [null, '', 'bad', 0, true, []]) {
  nsolid.start(config);
  assert.strictEqual(JSON.stringify(nsolid.config), previous);
}

// An empty environment variable must fall back to package.json or defaults.
tmpdir.refresh();
const pkg = join(tmpdir.path, 'package.json');
const script = `
  const assert = require('assert');
  const nsolid = require('nsolid');
  const expected = JSON.parse(process.env.EXPECTED);
  assert.strictEqual(nsolid.config.assetsEnabled, expected.assetsEnabled);
  assert.strictEqual(nsolid.config.contCpuProfile, expected.contCpuProfile);
  nsolid.start({ assetsEnabled: '', contCpuProfile: '', promiseTracking: '' });
  assert.strictEqual(nsolid.config.assetsEnabled, expected.assetsEnabled);
  assert.strictEqual(nsolid.config.contCpuProfile, expected.contCpuProfile);
  assert.strictEqual(nsolid.config.promiseTracking, false);
`;
for (const [config, expected] of [
  [{}, { assetsEnabled: true, contCpuProfile: false }],
  [{ assetsEnabled: false, contCpuProfile: true },
   { assetsEnabled: false, contCpuProfile: true }],
  [{ assetsEnabled: '', contCpuProfile: null },
   { assetsEnabled: true, contCpuProfile: false }],
  [{ assetsEnabled: {}, contCpuProfile: [] },
   { assetsEnabled: true, contCpuProfile: false }],
  [{ assetsEnabled: 'false', contCpuProfile: 'false' },
   { assetsEnabled: false, contCpuProfile: false }],
]) {
  writeFileSync(pkg, JSON.stringify({ nsolid: config }));
  const child = spawnSync(process.execPath, ['-e', script], {
    env: {
      ...process.env,
      NSOLID_PACKAGE_JSON: pkg,
      NSOLID_ASSETS_ENABLED: '',
      NSOLID_CONT_CPU_PROFILE: '',
      NSOLID_PROMISE_TRACKING: '',
      EXPECTED: JSON.stringify(expected),
    },
    encoding: 'utf8',
  });
  assert.strictEqual(child.status, 0, child.stderr);
}

const envKeys = {
  assetsEnabled: 'NSOLID_ASSETS_ENABLED',
  contCpuProfile: 'NSOLID_CONT_CPU_PROFILE',
  disablePackageScan: 'NSOLID_DISABLE_PACKAGE_SCAN',
  disableSnapshots: 'NSOLID_DISABLE_SNAPSHOTS',
  iisNode: 'NSOLID_IISNODE',
  pauseMetrics: 'NSOLID_PAUSE_METRICS',
  promiseTracking: 'NSOLID_PROMISE_TRACKING',
  redactSnapshots: 'NSOLID_REDACT_SNAPSHOTS',
  sourceCodeEnabled: 'NSOLID_SOURCE_CODE_ENABLED',
  tracingEnabled: 'NSOLID_TRACING_ENABLED',
  trackGlobalPackages: 'NSOLID_TRACK_GLOBAL_PACKAGES',
};

for (const [envValue, pkgValue, expected] of [
  ['0', true, false], ['false', true, false], ['', true, true],
  ['true', false, true], ['', false, false], ['x', false, true],
]) {
  writeFileSync(pkg, JSON.stringify({
    nsolid: Object.fromEntries(Object.keys(envKeys).map((key) => [key, pkgValue])),
  }));
  const child = spawnSync(process.execPath, ['-e', `
    const assert = require('assert');
    const nsolid = require('nsolid');
    const keys = ${JSON.stringify(Object.keys(envKeys))};
    const expected = JSON.parse(process.env.EXPECTED);
    for (const key of keys)
      assert.strictEqual(nsolid.config[key], expected, key);
    nsolid.start();
    for (const key of keys)
      assert.strictEqual(nsolid.config[key], expected, key);
    nsolid.start(Object.fromEntries(keys.map((key) => [key, !expected])));
    for (const key of keys)
      assert.strictEqual(nsolid.config[key], !expected, key);
  `], {
    env: {
      ...process.env,
      ...Object.fromEntries(Object.values(envKeys).map((key) => [key, envValue])),
      NSOLID_PACKAGE_JSON: pkg,
      EXPECTED: JSON.stringify(expected),
    },
    encoding: 'utf8',
  });
  assert.strictEqual(child.status, 0, child.stderr);
}

// Pre-start pause/resume calls override environment and package configuration.
for (const method of ['pauseMetrics', 'resumeMetrics']) {
  writeFileSync(pkg, JSON.stringify({
    nsolid: { pauseMetrics: method !== 'pauseMetrics' },
  }));
  const child = spawnSync(process.execPath, ['-e', `
    const assert = require('assert');
    const nsolid = require('nsolid');
    nsolid.${method}();
    assert.strictEqual(nsolid.metricsPaused, ${method === 'pauseMetrics'});
    assert.strictEqual(nsolid.config.pauseMetrics, ${method === 'pauseMetrics'});
    nsolid.start();
    assert.strictEqual(nsolid.config.pauseMetrics, ${method === 'pauseMetrics'});
    nsolid.start({ pauseMetrics: ${method !== 'pauseMetrics'} });
    assert.strictEqual(nsolid.config.pauseMetrics, ${method !== 'pauseMetrics'});
  `], {
    env: {
      ...process.env,
      NSOLID_PAUSE_METRICS: method === 'pauseMetrics' ? '0' : '1',
      NSOLID_PACKAGE_JSON: pkg,
    },
    encoding: 'utf8',
  });
  assert.strictEqual(child.status, 0, child.stderr);
}
