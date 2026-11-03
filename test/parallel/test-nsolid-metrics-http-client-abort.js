'use strict';
const common = require('../common');
const assert = require('assert');
const http = require('http');

const options = {
  method: 'GET',
  port: undefined,
  host: '127.0.0.1',
  path: '/'
};

const server = http.createServer(function(req, res) {
  res.destroy();
});

function onRequestError() {
  const metrics = require('nsolid').metrics();
  assert.ok(!Object.hasOwn(metrics, 'httpClientCount'));
  assert.strictEqual(metrics.httpClientAbortCount, 1);
  assert.ok(!Object.hasOwn(metrics, 'httpServerCount'));
  assert.strictEqual(metrics.httpServerAbortCount, 1);
  server.close();
}

function onListen() {
  options.port = this.address().port;
  const req = http.request(options, common.mustNotCall());
  req.end();
  req.once('error', common.mustCall(onRequestError));
}

server.listen(0, options.host, common.mustCall(onListen));
