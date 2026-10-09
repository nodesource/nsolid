'use strict';

require('../common');
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const script = path.join(__dirname,
                         '../fixtures/test-nsolid-config-interval-env-script.js');
const pkgJson = path.join(__dirname,
                          '../fixtures/nsolid-interval-package.json');

function runWithEnv(envVars) {
  const filteredEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('NSOLID_')),
  );

  const result = spawnSync(process.execPath, [script], {
    env: {
      ...filteredEnv,
      ...envVars,
    },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || `Script failed with status ${result.status}`);
  }

  return JSON.parse(result.stdout.trim());
}

{
  const config = runWithEnv({});
  assert.strictEqual(config.interval, 5000);
}

{
  const config = runWithEnv({
    NSOLID_INTERVAL: '2500',
  });
  assert.strictEqual(config.interval, 2500);
}

{
  const config = runWithEnv({
    NSOLID_INTERVAL: 'invalid',
  });
  assert.strictEqual(config.interval, 5000);
}

{
  const config = runWithEnv({
    NSOLID_INTERVAL: '0',
  });
  assert.strictEqual(config.interval, 5000);
}

{
  const config = runWithEnv({
    NSOLID_INTERVAL: '-1',
  });
  assert.strictEqual(config.interval, 5000);
}

{
  const config = runWithEnv({
    NSOLID_PACKAGE_JSON: pkgJson,
  });
  assert.strictEqual(config.interval, 3000);
}

{
  const config = runWithEnv({
    NSOLID_PACKAGE_JSON: pkgJson,
    NSOLID_INTERVAL: '2500',
  });
  assert.strictEqual(config.interval, 2500);
}

{
  const config = runWithEnv({
    NSOLID_PACKAGE_JSON: pkgJson,
    NSOLID_INTERVAL: '-1',
  });
  assert.strictEqual(config.interval, 3000);
}
