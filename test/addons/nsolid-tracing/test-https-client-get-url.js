// Flags: --dns-result-order=ipv4first
'use strict';

const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const fixtures = require('../../common/fixtures');
if (!common.hasCrypto)
  common.skip('missing crypto');

// Disable strict server certificate validation by the client
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const assert = require('assert');
const https = require('https');
const url = require('url');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const URL = url.URL;

const options = {
  key: fixtures.readKey('agent1-key.pem'),
  cert: fixtures.readKey('agent1-cert.pem'),
};

function setupTracesCheck(port) {
  const expectedTraces = [
    {
      attributes: {
        'http.method': 'GET',
        'http.status_code': 200,
        'http.status_text': 'OK',
        'http.url': `https://127.0.0.1:${port}/foo?bar`,
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
            'http.status_text': 'OK',
            'http.url': `https://127.0.0.1:${port}/foo?bar`,
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
        'http.url': `https://127.0.0.1:${port}/foo?bar`,
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
            'http.status_text': 'OK',
            'http.url': `https://127.0.0.1:${port}/foo?bar`,
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
        'http.url': `https://127.0.0.1:${port}/foo?bar`,
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
            'http.status_text': 'OK',
            'http.url': `https://127.0.0.1:${port}/foo?bar`,
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

const server = https.createServer(options, common.mustCall((req, res) => {
  assert.strictEqual(req.method, 'GET');
  assert.strictEqual(req.url, '/foo?bar');
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write('hello\n');
  res.end();
}, 3));

setupNSolid(common.mustCall(() => {
  server.listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port);
    const u = `https://${common.localhostIPv4}:${port}/foo?bar`;
    https.get(u, common.mustCall(() => {
      https.get(url.parse(u), common.mustCall(() => {
        https.get(new URL(u), common.mustCall(() => {
          server.close();
        }));
      }));
    }));
  }));
}));
