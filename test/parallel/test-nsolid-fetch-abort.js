'use strict';

const common = require('../common');
const assert = require('assert');
const http = require('http');

const server = http.createServer(common.mustCall((req, res) => {
  res.destroy();
}));

server.listen(0, '127.0.0.1', common.mustSucceed(async () => {
  try {
    await fetch(`http://127.0.0.1:${server.address().port}`);
  } catch (err) {
    assert.strictEqual(err.name, 'TypeError');
    assert.strictEqual(err.message, 'fetch failed');
    const undiciError = err.cause;
    assert.strictEqual(undiciError.name, 'SocketError');
    assert.strictEqual(undiciError.message, 'other side closed');
    assert.strictEqual(undiciError.code, 'UND_ERR_SOCKET');
    const metrics = require('nsolid').metrics();
    assert.ok(!Object.hasOwn(metrics, 'httpClientCount'));
    assert.strictEqual(metrics.httpClientAbortCount, 1);
    assert.ok(!Object.hasOwn(metrics, 'httpServerCount'));
    assert.strictEqual(metrics.httpServerAbortCount, 1);
    server.close();
  }
}));
