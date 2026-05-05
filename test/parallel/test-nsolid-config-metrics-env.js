'use strict';

// This test verifies that metricsBatchSize and metricsBufferSize are correctly
// validated when set via environment variables (initializeConfig path).
// Invalid values (Infinity, negative, zero, non-numeric) must fall back to
// the default.

require('../common');
const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const DEFAULT_METRICS_BATCH_SIZE = 1;
const DEFAULT_METRICS_BUFFER_SIZE = 100;

// Helper to run a small script with specific environment variables
function runWithEnv(envVars) {
  const script = path.join(
    __dirname,
    '../fixtures/test-nsolid-config-metrics-env-script.js'
  );

  const result = spawnSync(process.execPath, [script], {
    env: {
      ...process.env,
      ...envVars,
    },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    console.error(result.stderr);
    throw new Error(`Script execution failed with status ${result.status}`);
  }

  return JSON.parse(result.stdout.trim());
}

// Test default values (no env vars set)
{
  const config = runWithEnv({});
  assert.strictEqual(config.metricsBatchSize, DEFAULT_METRICS_BATCH_SIZE);
  assert.strictEqual(config.metricsBufferSize, DEFAULT_METRICS_BUFFER_SIZE);
}

// Test valid numeric string values
{
  const config = runWithEnv({
    NSOLID_METRICS_BATCH_SIZE: '5',
    NSOLID_METRICS_BUFFER_SIZE: '200',
  });
  assert.strictEqual(config.metricsBatchSize, 5);
  assert.strictEqual(config.metricsBufferSize, 200);
}

// Test valid float string values (should be accepted as positive finite)
{
  const config = runWithEnv({
    NSOLID_METRICS_BATCH_SIZE: '2.5',
    NSOLID_METRICS_BUFFER_SIZE: '50.5',
  });
  assert.strictEqual(config.metricsBatchSize, 2.5);
  assert.strictEqual(config.metricsBufferSize, 50.5);
}

// Test invalid env values all fall back to default
const invalidEnvValues = [
  '0',
  '-1',
  '-100',
  'Infinity',
  '-Infinity',
  'NaN',
  '',
  '  ',
  'abc',
  'true',
  'false',
];

for (const value of invalidEnvValues) {
  const config = runWithEnv({
    NSOLID_METRICS_BATCH_SIZE: value,
    NSOLID_METRICS_BUFFER_SIZE: value,
  });
  assert.strictEqual(
    config.metricsBatchSize,
    DEFAULT_METRICS_BATCH_SIZE,
    `metricsBatchSize should be default for env value: "${value}"`
  );
  assert.strictEqual(
    config.metricsBufferSize,
    DEFAULT_METRICS_BUFFER_SIZE,
    `metricsBufferSize should be default for env value: "${value}"`
  );
}
