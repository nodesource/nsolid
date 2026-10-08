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
  assert.strictEqual(nsolid.traceStats.httpClientCount, 1);
  assert.strictEqual(nsolid.traceStats.httpClientAbortCount, 0);
  assert.strictEqual(nsolid.traceStats.httpServerCount, 1);
  assert.strictEqual(nsolid.traceStats.httpServerAbortCount, 0);
  // Wait for more than 3 secs for the percentiles to be updated
  setTimeout(common.mustCall(() => {
    const metrics = require('nsolid').metrics();
    console.log(metrics);
    assert.ok(metrics.httpClientMedian > 0);
    assert.ok(metrics.httpClient99Ptile > 0);
    server.close();
  }), 5500);
}));
