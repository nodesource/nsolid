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
      children: [
        {
          attributes: {
            'http.method': 'GET',
            'http.url': `http://localhost:${port}/`,
          },
          end_reason: binding.kSpanEndOk,
          name: 'HTTP GET',
          thread_id: 0,
          kind: binding.kServer,
          type: binding.kSpanHttpServer,
          events: [
            {
              attributes: {
                'exception.message': 'kaboom',
                'exception.type': 'Error',
              },
              name: 'exception',
            },
          ],
          status: {
            code: 2, // ERROR
            message: 'kaboom',
          },
        },
      ],
      status: {
        code: 0,
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
  const server = http2.createServer(common.mustCall((req, res) => {
    res.stream.on('error', common.mustCall());
    req.on('error', common.mustNotCall());
    res.on('error', common.mustNotCall());
    req.on('aborted', common.mustCall());
    res.on('aborted', common.mustNotCall());

    res.write('hello');

    const expected = new Error('kaboom');
    res.stream.destroy(expected);
    server.close(common.mustCall());
  }));

  server.listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    const client = http2.connect(`http://localhost:${port}`, common.mustCall(() => {
      const request = client.request();
      request.on('data', common.mustCall((chunk) => {
        client.destroy();
      }));
    }));
  }));
}));
