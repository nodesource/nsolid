'use strict';

const common = require('../common');
if (!common.hasCrypto)
  common.skip('missing crypto');
const assert = require('assert');
const h2 = require('http2');
const nsolid = require('nsolid');

const server = h2.createServer();
server.listen(0, common.localhostIPv4, common.mustCall(() => {
  const afterConnect = common.mustCall((session) => {
    session.request({ ':method': 'POST' }).end(common.mustCall(() => {
      session.destroy();
      server.close();
    }));
  });

  const port = server.address().port;
  const host = common.localhostIPv4;
  h2.connect(`http://${host}:${port}`, afterConnect);
}));

process.on('beforeExit', common.mustCall(() => {
  assert.strictEqual(nsolid.traceStats.httpClientCount, 0);
  assert.strictEqual(nsolid.traceStats.httpClientAbortCount, 1);
  assert.strictEqual(nsolid.traceStats.httpServerCount, 0);
  assert.strictEqual(nsolid.traceStats.httpServerAbortCount, 1);
}));
