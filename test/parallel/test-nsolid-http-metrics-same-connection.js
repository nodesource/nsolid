'use strict';
const common = require('../common');
const assert = require('assert');
const http = require('http');
const net = require('net');
const nsolid = require('nsolid');


let n_reqs = 0;
const server = http.createServer(common.mustCall((req, res) => {
  setTimeout(() => {
    res.end();
    if (++n_reqs === 6) {
      server.close();
    }
  }, 100);
}, 6));

server.listen(0, 'localhost', common.mustCall(() => {
  const port = server.address().port;
  const req = `GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
              'Connection: keep-alive\r\n\r\n';
  const c = net.createConnection(port, common.mustCall(() => {
    for (let i = 0; i < 5; ++i) {
      c.write(req);
    }
    setTimeout(() => {
      c.write(req);
    }, 100);
  }));

  c.setEncoding('utf8');
  setTimeout(() => {
    const metrics = nsolid.metrics();
    assert.ok(metrics.httpServerMedian >= 100);
    assert.ok(metrics.httpServer99Ptile >= 100);
  }, 4000);
}));
