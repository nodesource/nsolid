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
        'http.status_code': 200,
        'http.url': `http://localhost:${port}/`,
        'network.protocol.version': '2',
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
            'http.method': 'GET',
            'http.status_code': 200,
            'http.url': `http://localhost:${port}/`,
            'network.protocol.version': '2',
          },
          end_reason: binding.kSpanEndOk,
          name: 'HTTP GET',
          thread_id: 0,
          kind: binding.kServer,
          type: binding.kSpanHttpServer,
        },
      ],
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
  server.on('stream', common.mustCall((stream, headers, flags) => {
    stream.respond({ 'content-type': 'text/html' });
    stream.end('test');
  }));

  server.listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    const client = http2.connect(`http://localhost:${port}`);
    const req = client.request();
    req.resume();
    req.on('end', common.mustCall(() => {
      server.close();
      client.close();
    }));
  }));
}));
