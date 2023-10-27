'use strict';
const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const assert = require('assert');
const http = require('http');
const net = require('net');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

function setupTracesCheck(addresses) {
  checkTracesOnExit(binding, [
    {
      attributes: {
        'dns.address': addresses[0].address,
        'dns.hostname': 'localhost',
        'dns.op_type': binding.kDnsLookup,
      },
      end_reason: binding.kSpanEndOk,
      events: [],
      name: 'DNS lookup',
      thread_id: 0,
      kind: binding.kClient,
      type: binding.kSpanDns,
      parentId: '0000000000000000',
    },
  ]);
}

let port;
let times = 0;
setupNSolid(common.mustSucceed(({ addresses }) => {
  const server = http.createServer(common.mustCall((req, res) => {
    res.end();
    if (++times === 2) {
      assert.ok(req.headers.traceparent);
      const parts = req.headers.traceparent.split('-');
      assert.strictEqual(parts.length, 4);
      assert.strictEqual(parts[0], '00');
      assert.strictEqual(parts[1], '80e1afed08e019fc1110464cfa66635c');
      assert.strictEqual(parts[2].length, 16);
      assert.strictEqual(parts[3], '00');
      server.close();
    } else {
      http.get(`http://localhost:${port}`);
    }
  }, 2));

  server.listen(0, common.mustCall(() => {
    port = server.address().port;
    setupTracesCheck(addresses);
    const c = net.connect(port, common.mustCall(() => {
      c.write('GET /hello HTTP/1.1\r\n');
      c.write('Host: example.org\r\n');
      c.end('traceparent: 00-80e1afed08e019fc1110464cfa66635c-7a085853722dc6d2-00\r\n\r\n');
      c.on('close', common.mustCall());
      c.resume();
    }));
  }));
}));
