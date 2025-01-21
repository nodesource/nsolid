'use strict';

const common = require('../common');
if (!common.hasCrypto)
  common.skip('missing crypto');
const assert = require('assert');
const http2 = require('http2');
const nsolid = require('nsolid');

const server = http2.createServer();
server.on('stream', common.mustCall((stream, headers, flags) => {
  stream.respond({ 'content-type': 'text/html' });
  stream.end('test');
}));


server.listen(0, common.mustCall(() => {
  const port = server.address().port;
  const client = http2.connect(`http://localhost:${port}`);

  const req = client.request();

  req.on('response', common.mustCall((headers) => {
    assert.strictEqual(headers[':status'], 200);
    assert.strictEqual(headers['content-type'], 'text/html');
  }));

  let data = '';

  req.setEncoding('utf8');
  req.on('data', common.mustCallAtLeast((d) => data += d));
  req.on('end', common.mustCall(() => {
    server.close();
    client.close(common.mustCall(() => {
      assert.strictEqual(data, 'test');
      assert.strictEqual(nsolid.traceStats.httpClientCount, 1);
      assert.strictEqual(nsolid.traceStats.httpClientAbortCount, 0);
      assert.strictEqual(nsolid.traceStats.httpServerCount, 1);
      assert.strictEqual(nsolid.traceStats.httpServerAbortCount, 0);
    }));
    // Wait for more than 3secs for the percentiles to be updated
    setTimeout(() => {
      const metrics = nsolid.metrics();
      assert.ok(metrics.httpClientMedian > 0);
      assert.ok(metrics.httpClient99Ptile > 0);
      assert.ok(metrics.httpServerMedian > 0);
      assert.ok(metrics.httpServer99Ptile > 0);
    }, 3500);
  }));
}));
