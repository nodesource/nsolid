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
      status: {
        code: 2, // ERROR
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

  server.listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    const client = http2.connect(`http://localhost:${port}`);
    server.on('connection', common.mustCall(() => {
      server.close();
      client.close();
    }));

    const req = client.request();
    req.destroy();
  }));
}));
