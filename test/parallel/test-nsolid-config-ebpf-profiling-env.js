'use strict';

require('../common');
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const script = path.join(__dirname,
                         '../fixtures/test-nsolid-config-ebpf-profiling-env-script.js');
const pkgJson = path.join(__dirname,
                          '../fixtures/nsolid-ebpf-profiling-package.json');

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

function assertEbpfProfiling(config, enabled) {
  const expected = enabled ? [1, 2] : [0, 2];
  assert.ok(expected.includes(config.ebpfProfiling));
}

{
  const config = runWithEnv({
    NSOLID_EBPF_PROFILING: 'false',
  });
  assertEbpfProfiling(config, false);
}

{
  const config = runWithEnv({
    NSOLID_EBPF_PROFILING: 'true',
  });
  assertEbpfProfiling(config, true);
}

{
  const config = runWithEnv({
    NSOLID_PACKAGE_JSON: pkgJson,
  });
  assertEbpfProfiling(config, true);
}

{
  const config = runWithEnv({
    NSOLID_EBPF_PROFILING: 'false',
    TEST_EBPF_PROFILING: 'true',
  });
  assertEbpfProfiling(config, true);
}
