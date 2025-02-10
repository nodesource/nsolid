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
            'exception.message': 'The pending stream has been canceled (caused by: The operation was aborted)',
            'exception.type': 'ERR_HTTP2_STREAM_CANCEL',
          },
          name: 'exception',
        },
      ],
      status: {
        code: 2, // ERROR
        message: 'The pending stream has been canceled (caused by: The operation was aborted)',
      },
    },
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
    const { signal } = controller;
    const client = http2.connect(`http://localhost:${port}`, { signal });
    client.on('close', common.mustCall());

    client.on('error', common.mustCall());

    const req = client.request({}, {});

    req.on('error', common.mustCall());
    req.on('close', common.mustCall(() => {
      server.close();
    }));

    controller.abort();
  }));
}));
