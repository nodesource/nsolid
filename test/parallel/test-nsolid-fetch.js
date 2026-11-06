'use strict';

const common = require('../common');
const assert = require('assert');
const http = require('http');
const nsolid = require('nsolid');

const server = http.createServer(common.mustCall((req, res) => {
  res.end();
}));

server.listen(0, '127.0.0.1', common.mustSucceed(async () => {
  await fetch(`http://127.0.0.1:${server.address().port}`);
  assert.ok(!Object.hasOwn(nsolid.traceStats, 'httpClientCount'));
  assert.strictEqual(nsolid.traceStats.httpClientAbortCount, 0);
  assert.ok(!Object.hasOwn(nsolid.traceStats, 'httpServerCount'));
  assert.strictEqual(nsolid.traceStats.httpServerAbortCount, 0);
  server.close();
}));
