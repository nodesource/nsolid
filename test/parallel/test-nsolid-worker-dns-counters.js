'use strict';

const common = require('../common');
const assert = require('assert');
const { Worker, isMainThread } = require('worker_threads');

if (isMainThread) {
  const worker = new Worker(__filename);
  worker.on('exit', common.mustCall((code) => {
    assert.strictEqual(code, 0);
  }));
} else {
  const dns = require('dns');
  const nsolid = require('nsolid');
  const count = nsolid.traceStats.dnsCount;
  dns.lookup('127.0.0.1', common.mustSucceed((address, family) => {
    assert.strictEqual(address, '127.0.0.1');
    assert.strictEqual(family, 4);
    assert.strictEqual(nsolid.traceStats.dnsCount, count + 1);
  }));
}
