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
  // Check abort counters with multiple requests in parallel.
  const requests = [];
  for (let i = 0; i < REQUESTS; i++) {
    requests.push(fetch(`http://127.0.0.1:${server.address().port}/${i}`));
  }

  await Promise.all(requests);
  assert.ok(!Object.hasOwn(nsolid.traceStats, 'httpClientCount'));
  assert.strictEqual(nsolid.traceStats.httpClientAbortCount, 0);
  assert.ok(!Object.hasOwn(nsolid.traceStats, 'httpServerCount'));
  assert.strictEqual(nsolid.traceStats.httpServerAbortCount, 0);
  server.close();
}));
