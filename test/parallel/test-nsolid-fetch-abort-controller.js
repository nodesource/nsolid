'use strict';

const common = require('../common');
const assert = require('assert');
const http = require('http');

const controller = new AbortController();
const signal = controller.signal;

const server = http.createServer(common.mustCall(() => {
  controller.abort();
}));

server.listen(0, '127.0.0.1', common.mustSucceed(() => {
  fetch(`http://127.0.0.1:${server.address().port}`,
        { signal }).catch(common.mustCall((err) => {
    assert.strictEqual(err.name, 'AbortError');
    assert.strictEqual(err.message, 'This operation was aborted');
    const metrics = require('nsolid').metrics();
    assert.ok(!Object.hasOwn(metrics, 'httpClientCount'));
    assert.strictEqual(metrics.httpClientAbortCount, 1);
    assert.ok(!Object.hasOwn(metrics, 'httpServerCount'));
    assert.strictEqual(metrics.httpServerAbortCount, 0);
    server.close();
  }));
}));
