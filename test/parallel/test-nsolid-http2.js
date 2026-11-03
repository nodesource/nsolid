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
      assert.ok(!Object.hasOwn(nsolid.traceStats, 'httpClientCount'));
      assert.strictEqual(nsolid.traceStats.httpClientAbortCount, 0);
      assert.ok(!Object.hasOwn(nsolid.traceStats, 'httpServerCount'));
      assert.strictEqual(nsolid.traceStats.httpServerAbortCount, 0);
    }));

  }));
}));
