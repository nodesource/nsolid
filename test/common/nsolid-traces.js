'use strict';

require('../common');

const before = performance.timeOrigin + performance.now();

function checkTracesOnExit({ expectedTrace }, expectedTraces) {
  process.once('beforeExit', () => {
    setTimeout(() => {}, 1000);
  });
  expectedTraces.forEach((t) => {
    expectedTrace(before, JSON.stringify(t));
  });
}

function getAddresses(cb) {
  const dns = require('dns');
  dns.lookup('localhost', { all: true }, cb);
}

module.exports = {
  checkTracesOnExit,
  getAddresses,
};
