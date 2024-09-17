// Flags: --dns-result-order=ipv4first
'use strict';

const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const { fixturesDir } = require('../../common/fixtures');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const http = require('http');
const nsolid = require('nsolid');
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixturesDir] }));

function setupTracesCheck(port, addresses) {
  const expectedTraces = [
    {
      attributes: {
        'http.method': 'GET',
        'http.status_code': 200,
        'http.status_text': 'OK',
        'http.url': `http://localhost:${port}/1`,
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
            'http.url': `http://localhost:${port}/1`,
          },
          end_reason: binding.kSpanEndOk,
          name: 'HTTP GET',
          thread_id: 0,
          kind: binding.kServer,
          type: binding.kSpanHttpServer,
          children: [
            {
              attributes: {
                'http.method': 'GET',
                'http.status_code': 200,
                'http.status_text': 'OK',
                'http.url': `http://localhost:${port}/2`,
              },
              end_reason: binding.kSpanEndOk,
              name: 'HTTP GET',
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
                    'http.url': `http://localhost:${port}/2`,
                  },
                  end_reason: binding.kSpanEndOk,
                  name: 'HTTP GET',
                  thread_id: 0,
                  kind: binding.kServer,
                  type: binding.kSpanHttpServer,
                },
              ],
            },
          ],
        },
      ],
    },
  ];

  checkTracesOnExit(binding, expectedTraces);
}

setupNSolid(common.mustSucceed(({ addresses }) => {
  if (!nsolid.otel.register(api)) {
    throw new Error('Error registering api');
  }

  let port;

  const server = http.createServer((req, res) => {
    if (req.url === '/1') {
      http.get(`http://localhost:${port}/2`, () => {
        res.end();
      });
    } else {
      res.end();
      server.close();
    }
  });

  server.listen(0, '127.0.0.1', () => {
    port = server.address().port;
    setupTracesCheck(port, addresses);
    http.get(`http://localhost:${port}/1`);
  });
}));
