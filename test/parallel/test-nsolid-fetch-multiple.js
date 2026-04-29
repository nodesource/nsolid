'use strict';

const common = require('../common');
const assert = require('assert');
const http = require('http');
const nsolid = require('nsolid');

const REQUESTS = 10;

const server = http.createServer(common.mustCall((req, res) => {
  if (req.url === '/1') {
    setTimeout(() => {
      res.end();
    }, 1000);
  } else {
    res.end();
  }
}, REQUESTS));

server.listen(0, '127.0.0.1', common.mustSucceed(async () => {
  // Check that the fetch counters work correctly even with multiple requests
  // in parallel.
  const requests = [];
  for (let i = 0; i < REQUESTS; i++) {
    requests.push(fetch(`http://127.0.0.1:${server.address().port}/${i}`));
  }

  await Promise.all(requests);
  assert.strictEqual(nsolid.traceStats.httpClientCount, REQUESTS);
  assert.strictEqual(nsolid.traceStats.httpClientAbortCount, 0);
  assert.strictEqual(nsolid.traceStats.httpServerCount, REQUESTS);
  assert.strictEqual(nsolid.traceStats.httpServerAbortCount, 0);
  // Wait for more than 3 secs for the percentiles to be updated
  setTimeout(common.mustCall(() => {
    const metrics = require('nsolid').metrics();
    // As all requests but one are fast, the median should be less than 200ms
    // and the 99th percentile should be more than 1000ms due to the slow
    // request.
    assert.ok(metrics.httpClientMedian < 200);
    assert.ok(metrics.httpClient99Ptile > 1000);
    server.close();
  }), 5500);
}));
