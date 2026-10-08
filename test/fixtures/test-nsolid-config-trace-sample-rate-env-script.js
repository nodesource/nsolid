'use strict';

require('../common');
const nsolid = require('nsolid');

nsolid.start();

console.log(JSON.stringify({
  traceSampleRate: nsolid.config.traceSampleRate,
}));
