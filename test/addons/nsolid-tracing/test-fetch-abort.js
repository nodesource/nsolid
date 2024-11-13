// Flags: --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
const assert = require('assert');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const http = require('http');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

function setupTracesCheck(port, addresses) {
  const expectedTraces = [
    {
      attributes: {
        'http.method': 'GET',
        'http.url': `http://localhost:${port}/`,
      },
      end_reason: binding.kSpanEndOk,
      name: 'HTTP GET',
      parentId: '0000000000000000',
      thread_id: 0,
      kind: binding.kClient,
      type: binding.kSpanHttpClient,
      events: [
        {
          attributes: {
            'exception.message': 'other side closed',
            'exception.type': 'UND_ERR_SOCKET',
          },
          name: 'exception',
        },
      ],
      status: {
        code: 2, // ERROR
        message: 'other side closed',
      },
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
        {
          attributes: {
            'http.method': 'GET',
            'http.url': `http://localhost:${port}/`,
          },
          end_reason: binding.kSpanEndError,
          name: 'HTTP GET',
          thread_id: 0,
          kind: binding.kServer,
          type: binding.kSpanHttpServer,
        },
      ],
    },
  ];

  checkTracesOnExit(binding, expectedTraces);
}

setupNSolid(common.mustSucceed(({ addresses }) => {
  const server = http.createServer(common.mustCall((req, res) => {
    res.destroy();
  }));

  server.listen(0, common.mustSucceed(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    fetch(`http://localhost:${port}`).catch(common.mustCall((err) => {
      assert.strictEqual(err.name, 'TypeError');
      assert.strictEqual(err.message, 'fetch failed');
      const undiciError = err.cause;
      assert.strictEqual(undiciError.name, 'SocketError');
      assert.strictEqual(undiciError.message, 'other side closed');
      assert.strictEqual(undiciError.code, 'UND_ERR_SOCKET');
      server.close();
    }));
  }));
}));
