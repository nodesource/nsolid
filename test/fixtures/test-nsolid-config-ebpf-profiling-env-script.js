'use strict';

require('../common');
const nsolid = require('nsolid');

const config = process.env.TEST_EBPF_PROFILING === undefined ? undefined : {
  ebpfProfiling: process.env.TEST_EBPF_PROFILING,
};
nsolid.start(config);

console.log(JSON.stringify({
  ebpfProfiling: nsolid.config.ebpfProfiling,
}));
