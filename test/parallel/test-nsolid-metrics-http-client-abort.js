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

server.listen(0, options.host, function() {
  options.port = this.address().port;
  const req = http.request(options, common.mustNotCall());
  req.end();
  req.once('error', () => {
    const metrics = require('nsolid').metrics();
    assert.strictEqual(metrics.httpClientCount, 0);
    assert.strictEqual(metrics.httpClientAbortCount, 1);
    assert.strictEqual(metrics.httpServerCount, 0);
    assert.strictEqual(metrics.httpServerAbortCount, 1);
    server.close();
  });
});
