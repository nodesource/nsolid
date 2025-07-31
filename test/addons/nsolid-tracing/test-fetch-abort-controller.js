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
            'exception.type': 'ECONNREFUSED',
          },
          name: 'exception',
        },
      ],
      status: {
        code: 2, // ERROR
      },
      children: [
        {
          attributes: {
            'dns.address': addresses,
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

setupNSolid(common.mustSucceed(({ addresses }) => {
  const controller = new AbortController();
  const signal = controller.signal;

  const server = http.createServer(common.mustNotCall());
  server.listen(0, common.mustSucceed(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    fetch(`http://localhost:${port}`,
          { signal }).catch(common.mustCall((err) => {
      assert.strictEqual(err.name, 'AbortError');
      assert.strictEqual(err.message, 'This operation was aborted');
      server.close();
    }));
    controller.abort();
  }));
}));
