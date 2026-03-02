'use strict';

require('../common');
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const script = path.join(__dirname,
                         '../fixtures/test-nsolid-config-trace-sample-rate-env-script.js');
const pkgJson = path.join(__dirname,
                          '../fixtures/nsolid-trace-sample-rate-package.json');

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
  const config = runWithEnv({
    NSOLID_TRACE_SAMPLE_RATE: '0.25',
  });
  assert.strictEqual(config.traceSampleRate, 0.25);
}

{
  const config = runWithEnv({
    NSOLID_PACKAGE_JSON: pkgJson,
  });
  assert.strictEqual(config.traceSampleRate, 0.7);
}

{
  const config = runWithEnv({
    NSOLID_PACKAGE_JSON: pkgJson,
    NSOLID_TRACE_SAMPLE_RATE: '0.35',
  });
  assert.strictEqual(config.traceSampleRate, 0.35);
}
