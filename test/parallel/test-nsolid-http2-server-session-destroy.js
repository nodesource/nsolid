'use strict';

const common = require('../common');
if (!common.hasCrypto)
  common.skip('missing crypto');
const assert = require('assert');
const h2 = require('http2');
const nsolid = require('nsolid');

let session_;
const server = h2.createServer();
server.listen(0, common.localhostIPv4, common.mustCall(() => {
  const afterConnect = common.mustCall((session) => {
    session_ = session;
    session.request({ ':method': 'POST' }).end(common.mustCall());
  });

  const port = server.address().port;
  const host = common.localhostIPv4;
  h2.connect(`http://${host}:${port}`, afterConnect);
}));

server.on('stream', common.mustCall(() => {
  session_.destroy();
  server.close();
}));

process.on('beforeExit', common.mustCall(() => {
  assert.ok(!Object.hasOwn(nsolid.traceStats, 'httpClientCount'));
  assert.strictEqual(nsolid.traceStats.httpClientAbortCount, 1);
  assert.ok(!Object.hasOwn(nsolid.traceStats, 'httpServerCount'));
  assert.strictEqual(nsolid.traceStats.httpServerAbortCount, 1);
}));
