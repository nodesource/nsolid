// Flags: --dns-result-order=ipv4first
'use strict';

const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const assert = require('assert');
const http = require('http');
const url = require('url');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);
const URL = url.URL;
const testPath = '/foo?bar';

function setupTracesCheck(port, addresses) {
  const expectedTraces = [
    {
      attributes: {
        'http.method': 'GET',
        'http.status_code': 200,
        'http.status_text': 'OK',
        'http.url': `http://localhost:${port}/foo?bar`,
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
            'http.url': `http://localhost:${port}/foo?bar`,
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
        'http.method': 'GET',
        'http.status_code': 200,
        'http.status_text': 'OK',
        'http.url': `http://localhost:${port}/foo?bar`,
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
            'http.url': `http://localhost:${port}/foo?bar`,
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
        'http.method': 'GET',
        'http.status_code': 200,
        'http.status_text': 'OK',
        'http.url': `http://localhost:${port}/foo?bar`,
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
            'http.url': `http://localhost:${port}/foo?bar`,
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

const server = http.createServer(common.mustCall((req, res) => {
  assert.strictEqual(req.method, 'GET');
  assert.strictEqual(req.url, testPath);
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('hello\n');
  res.end();
}, 3));

setupNSolid(common.mustSucceed(({ addresses }) => {
  server.listen(0, common.localhostIPv4, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    const u = `http://localhost:${port}${testPath}`;
    http.get(u, common.mustCall(() => {
      http.get(url.parse(u), common.mustCall(() => {
        http.get(new URL(u), common.mustCall(() => {
          server.close();
        }));
      }));
    }));
  }));
}));
