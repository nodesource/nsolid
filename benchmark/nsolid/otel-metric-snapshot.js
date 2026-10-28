'use strict';

const common = require('../common');
const nsolid = require('nsolid');
const bench = common.createBenchmark(main, {
  n: [ 1000 ],
  cardinality: [ 1, 100, 1999 ],
}, { flags: [ '--expose-internals' ] });

function main({ n, cardinality }) {
  const { internalBinding } = require('internal/test/binding');
  const { Metrics } = internalBinding('metrics');
  const binding = new Metrics();
  const meter = nsolid.otel.api.metrics.getMeter('snapshot-benchmark', '1.0', {
    schemaUrl: 'https://example.com/metrics/schema',
  });
  const counter = meter.createCounter('requests', {
    unit: '1', description: 'Completed requests by route and response status',
  });
  for (let id = 0; id < cardinality; id++) counter.add(1, { id });
  bench.start();
  for (let i = 0; i < n; i++) binding.collect();
  bench.end(n);
}
