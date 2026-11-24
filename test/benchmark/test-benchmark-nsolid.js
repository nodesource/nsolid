'use strict';

const common = require('../common');

if (!common.enoughTestMem)
  common.skip('Insufficient memory for N|Solid benchmark test');

const runBenchmark = require('../common/benchmark');

runBenchmark('nsolid');
