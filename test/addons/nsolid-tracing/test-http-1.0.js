// Flags: --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const assert = require('assert');
const http = require('http');
const net = require('net');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

function setupTracesCheck(port, addresses) {
  const expectedTraces = [
    {
      attributes: {
        'dns.address': addresses[0].address,
        'dns.hostname': 'localhost',
        'dns.op_type': binding.kDnsLookup,
      },
      name: 'DNS lookup',
      end_reason: binding.kSpanEndOk,
      thread_id: 0,
      kind: binding.kClient,
      type: binding.kSpanDns,
    },
    {
      attributes: {
        'http.method': 'GET',
        'http.status_code': 200,
        'http.status_text': 'OK',
        'http.url': 'http://localhost/',
        'network.protocol.version': '1.0',
      },
      end_reason: binding.kSpanEndOk,
      name: 'HTTP GET',
      thread_id: 0,
      kind: binding.kServer,
      type: binding.kSpanHttpServer,
    },
  ];

  checkTracesOnExit(binding, expectedTraces);
}

const body = 'hello world\n';

setupNSolid(common.mustSucceed(({ addresses }) => {
  const server = http.createServer(common.mustCall((req, res) => {
    assert.strictEqual(req.httpVersion, '1.0');
    assert.strictEqual(req.httpVersionMajor, 1);
    assert.strictEqual(req.httpVersionMinor, 0);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(body);
  }));

  let server_response = '';
  server.listen(0, () => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    const c = net.createConnection(port);

    c.setEncoding('utf8');

    c.on('connect', function() {
      c.write('GET / HTTP/1.0\r\n\r\n');
    });

    c.on('data', function(chunk) {
      server_response += chunk;
    });

    c.on('end', common.mustCall(function() {
      c.end();
      server.close();
      const m = server_response.split('\r\n\r\n');
      assert.strictEqual(m[1], body);
    }));
  });
}));
