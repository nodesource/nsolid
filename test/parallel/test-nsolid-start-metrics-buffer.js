'use strict';

require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

const defaultBatchSize = nsolid.config.metricsBatchSize;
const defaultBufferSize = nsolid.config.metricsBufferSize;

nsolid.start({
  metricsBatchSize: defaultBatchSize + 1,
  metricsBufferSize: defaultBufferSize + 50
});
assert.strictEqual(nsolid.config.metricsBatchSize, defaultBatchSize + 1);
assert.strictEqual(nsolid.config.metricsBufferSize, defaultBufferSize + 50);

nsolid.start({
  metricsBatchSize: `${defaultBatchSize + 2}`,
  metricsBufferSize: `${defaultBufferSize + 100}`
});
assert.strictEqual(nsolid.config.metricsBatchSize, defaultBatchSize + 2);
assert.strictEqual(nsolid.config.metricsBufferSize, defaultBufferSize + 100);

// Invalid inputs should be ignored
const invalidValues = [
  0, -1, NaN, Infinity, -Infinity,
  undefined, null, true, false, {}, [], () => {},
  '0', '-1', 'NaN', 'Infinity', '-Infinity', '', '  ',
];
for (const value of invalidValues) {
  nsolid.start({
    metricsBatchSize: value,
    metricsBufferSize: value
  });
  assert.strictEqual(nsolid.config.metricsBatchSize,
                     defaultBatchSize + 2,
                     `metricsBatchSize changed unexpectedly for value: ${String(value)}`);
  assert.strictEqual(nsolid.config.metricsBufferSize,
                     defaultBufferSize + 100,
                     `metricsBufferSize changed unexpectedly for value: ${String(value)}`);
}

nsolid.start({
  metricsBatchSize: defaultBatchSize,
  metricsBufferSize: defaultBufferSize
});
assert.strictEqual(nsolid.config.metricsBatchSize, defaultBatchSize);
assert.strictEqual(nsolid.config.metricsBufferSize, defaultBufferSize);
