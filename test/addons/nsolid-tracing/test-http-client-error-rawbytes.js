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
        'http.method': 'GET',
        'http.url': `http://localhost:${port}/`,
      },
      end_reason: binding.kSpanEndError,
      name: 'HTTP GET',
      parentId: '0000000000000000',
      thread_id: 0,
      kind: binding.kClient,
      type: binding.kSpanHttpClient,
      children: [
        {
          attributes: {
            'dns.address': [{ address: addresses[0].address,
                              family: addresses[0].family }],
            'dns.hostname': 'localhost',
            'dns.op_type': binding.kDnsLookup,
          },
          end_reason: binding.kSpanEndOk,
          name: 'DNS lookup',
          thread_id: 0,
          kind: binding.kClient,
          type: binding.kSpanDns,
        },
      ],
    },
  ];

  checkTracesOnExit(binding, expectedTraces);
}

const response = Buffer.from('HTTP/1.1 200 OK\r\n' +
  'Content-Length: 6\r\n' +
  'Transfer-Encoding: Chunked\r\n' +
  '\r\n' +
  '6\r\nfoobar' +
  '0\r\n');

setupNSolid(common.mustSucceed(({ addresses }) => {
  const server = net.createServer(common.mustCall((conn) => {
    conn.write(response);
  }));

  server.listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    const req = http.get(`http://localhost:${server.address().port}/`);
    req.end();
  }));

  // This is to check that the request `error` event is actually emitted when
  // tracing is enabled.
  process.on('uncaughtException', common.mustCall((err) => {
    const reason = 'Content-Length can\'t be present with Transfer-Encoding';
    assert.strictEqual(err.message, `Parse Error: ${reason}`);
    assert(err.bytesParsed < response.length);
    assert(err.bytesParsed >= response.indexOf('Transfer-Encoding'));
    assert.strictEqual(err.code, 'HPE_UNEXPECTED_CONTENT_LENGTH');
    assert.strictEqual(err.reason, reason);
    assert.deepStrictEqual(err.rawPacket, response);

    server.close();
  }));
}));
