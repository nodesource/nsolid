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
  server.on('stream', common.mustCall((stream, headers, flags) => {
    stream.respond({ 'content-type': 'text/html' });
    stream.end('test');
  }));

  server.listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    server.once('request', common.mustCall(function(request, response) {
      request.on('data', () => {});
      request.on('end', common.mustCall(() => {
        response.on('finish', common.mustCall(() => {
          server.close();
        }));
        response.end();
      }));
    }));

    const client = http2.connect(`http://localhost:${port}`, common.mustCall(() => {
      const request = client.request();
      request.resume();
      request.on('end', common.mustCall(() => {
        client.close(common.mustCall());
      }));
    }));
  }));
}));
