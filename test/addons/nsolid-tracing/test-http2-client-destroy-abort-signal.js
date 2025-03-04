// Flags: --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
if (!common.hasCrypto)
  common.skip('missing crypto');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const http2 = require('http2');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

function setupTracesCheck(port, addresses) {
  const expectedTraces = [
    {
      attributes: {
        'http.method': 'GET',
        'http.url': `http://localhost:${port}/`,
        'network.protocol.version': '2',
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
            'exception.message': 'The operation was aborted',
            'exception.type': 'ABORT_ERR',
          },
          name: 'exception',
        },
      ],
      status: {
        code: 2, // ERROR
        message: 'The operation was aborted',
      },
    },
    {
      attributes: {
        'dns.address': addresses[0].address,
        'dns.hostname': 'localhost',
        'dns.op_type': binding.kDnsLookup,
      },
      end_reason: binding.kSpanEndOk,
      name: 'DNS lookup',
      thread_id: 0,
      kind: binding.kClient,
      type: binding.kSpanDns,
    },
  ];

  checkTracesOnExit(binding, expectedTraces);
}

setupNSolid(common.mustSucceed(({ addresses }) => {
  const server = http2.createServer();
  const controller = new AbortController();

  server.on('stream', common.mustNotCall());

  server.listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    const client = http2.connect(`http://localhost:${port}`);
    client.on('close', common.mustCall());

    const { signal } = controller;

    client.on('error', common.mustCall());

    const req = client.request({}, { signal });

    req.on('error', common.mustCall());
    req.on('close', common.mustCall(() => {
      server.close();
    }));

    controller.abort();
  }));
}));
