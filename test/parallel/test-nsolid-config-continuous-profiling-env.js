'use strict';

// This test verifies that continuous profiling configuration works
// correctly when set via environment variables

require('../common');
const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

// Helper to run a small script with specific environment variables
function runWithEnv(envVars) {
  const script = path.join(__dirname, '../fixtures/test-nsolid-config-continuous-profiling-env-script.js');

  const result = spawnSync(process.execPath, [script], {
    env: {
      ...process.env,
      ...envVars
    },
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    console.error(result.stderr);
    throw new Error(`Script execution failed with status ${result.status}`);
  }

  return JSON.parse(result.stdout.trim());
}

// Test default values (when no environment variables are set)
{
  const config = runWithEnv({});
  assert.strictEqual(config.contCpuProfile, false);
  assert.strictEqual(config.contCpuProfileInterval, 30000); // Default is 30 seconds
}

// Test CPU continuous profiling configuration via environment variables
{
  const config = runWithEnv({
    NSOLID_CONT_CPU_PROFILE: 'true',
    NSOLID_CONT_CPU_PROFILE_INTERVAL: '60000'
  });
  assert.strictEqual(config.contCpuProfile, true);
  assert.strictEqual(config.contCpuProfileInterval, 60000);
}


// Test boolean coercion for environment variables
{
  const config = runWithEnv({
    NSOLID_CONT_CPU_PROFILE: '1',
  });
  assert.strictEqual(config.contCpuProfile, true);
}

{
  const config = runWithEnv({
    NSOLID_CONT_CPU_PROFILE: 'yes'
  });
  assert.strictEqual(config.contCpuProfile, true);
}

// Test disabling via environment variables
{
  const config = runWithEnv({
    NSOLID_CONT_CPU_PROFILE: 'false',
  });
  assert.strictEqual(config.contCpuProfile, false);
}
