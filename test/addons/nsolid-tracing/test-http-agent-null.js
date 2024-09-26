// Flags: --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
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
        'http.status_code': 200,
        'http.status_text': 'OK',
        'http.url': `http://localhost:${port}/`,
      },
      end_reason: binding.kSpanEndOk,
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
        {
          attributes: {
            'http.method': 'GET',
            'http.status_code': 200,
            'http.status_text': 'OK',
            'http.url': `http://localhost:${port}/`,
          },
          end_reason: binding.kSpanEndOk,
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
    res.end();
  })).listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    const options = {
      agent: null,
      port,
    };

    http.get(options, common.mustCall((res) => {
      res.resume();
      server.close();
    }));
  }));
}));
