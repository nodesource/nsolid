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
        'http.method': 'POST',
        'http.url': `http://localhost:${port}/`,
        'network.protocol.version': '2',
      },
      end_reason: binding.kSpanEndOk,
      name: 'HTTP POST',
      parentId: '0000000000000000',
      thread_id: 0,
      kind: binding.kClient,
      type: binding.kSpanHttpClient,
      children: [
        {
          attributes: {
            'http.method': 'POST',
            'http.url': `http://localhost:${port}/`,
            'network.protocol.version': '2',
          },
          end_reason: binding.kSpanEndOk,
          name: 'HTTP POST',
          thread_id: 0,
          kind: binding.kServer,
          type: binding.kSpanHttpServer,
          status: {
            code: 2, // ERROR
          },
        },
      ],
      status: {
        code: 2, // ERROR
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
  server.on('stream', common.mustCall((stream) => {
    stream.session.destroy();
    server.close();
  }));
  server.listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    http2.connect(`http://localhost:${port}`, common.mustCall((session) => {
      session.request({ ':method': 'POST' }).end(common.mustCall());
    }));
  }));
}));
