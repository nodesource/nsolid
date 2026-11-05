'use strict';

const common = require('../common');
const nsolid = require('nsolid');
const bench = common.createBenchmark(main, {
  n: [ 200000 ],
  cardinality: [ 1, 100, 1999 ],
  type: [ 'counter', 'histogram' ],
});

function main({ n, cardinality, type }) {
  const meter = nsolid.otel.api.metrics.getMeter('record-benchmark');
  const instrument = type === 'counter' ? meter.createCounter('requests') :
    meter.createHistogram('duration');
  const record = instrument[type === 'counter' ? 'add' : 'record']
    .bind(instrument);
  const attributes = Array.from({ length: cardinality }, (_, id) =>
    ({ route: '/items', status: 200, id }));
  bench.start();
  for (let i = 0; i < n; i++) record(1, attributes[i % cardinality]);
  bench.end(n);
}
