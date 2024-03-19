// Flags: --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const assert = require('assert');
const http = require('http');
const Countdown = require('../../common/countdown');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

function setupTracesCheck(port, addresses) {
  const expectedTraces = [
    {
      attributes: {
        'http.method': 'CONNECT',
        'http.status_code': 200,
        'http.status_text': 'Connection established',
        'http.url': `http://localhost:${port}google.com:80`,
      },
      end_reason: binding.kTraceEndOk,
      name: 'HTTP CONNECT',
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
          end_reason: binding.kTraceEndOk,
          name: 'DNS lookup',
          thread_id: 0,
          kind: binding.kClient,
          type: binding.kTraceDns,
        },
        {
          attributes: {
            'http.method': 'CONNECT',
            'http.url': `http://localhost:${port}google.com:80`,
          },
          end_reason: binding.kSpanEndExit,
          name: 'HTTP CONNECT',
          thread_id: 0,
          kind: binding.kServer,
          type: binding.kSpanHttpServer,
        },
        {
          attributes: {
            'http.method': 'GET',
            'http.status_code': 200,
            'http.status_text': 'OK',
            'http.url': `http://localhost:${port}/request0`,
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
              name: 'DNS lookup',
              end_reason: binding.kSpanEndOk,
              thread_id: 0,
              kind: binding.kClient,
              type: binding.kSpanDns,
            },
            {
              attributes: {
                'http.method': 'GET',
                'http.status_code': 200,
                'http.status_text': 'OK',
                'http.url': `http://localhost:${port}/request0`,
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
            'http.url': `http://localhost:${port}/request1`,
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
              name: 'DNS lookup',
              end_reason: binding.kSpanEndOk,
              thread_id: 0,
              kind: binding.kClient,
              type: binding.kSpanDns,
            },
            {
              attributes: {
                'http.method': 'GET',
                'http.status_code': 200,
                'http.status_text': 'OK',
                'http.url': `http://localhost:${port}/request1`,
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
  ];

  // The CONNECT http server transaction end is not detected because the
  // response never goes through the http module but written directly to the
  // socket

  checkTracesOnExit(binding, expectedTraces);
}

setupNSolid(common.mustSucceed(({ addresses }) => {
  const server = http.createServer(common.mustCall((req, res) => {
    req.resume();
    res.writeHead(200);
    res.write('');
    setTimeout(() => res.end(req.url), 50);
  }, 2));

  const countdown = new Countdown(2, () => server.close());

  server.on('connect', common.mustCall((req, socket) => {
    socket.write('HTTP/1.1 200 Connection established\r\n\r\n');
    socket.resume();
    socket.on('end', () => socket.end());
  }));

  server.listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    const req = http.request({
      port,
      method: 'CONNECT',
      path: 'google.com:80',
    });
    req.on('connect', common.mustCall((res, socket) => {
      socket.end();
      socket.on('end', common.mustCall(() => {
        doRequest(0);
        doRequest(1);
      }));
      socket.resume();
    }));
    req.end();
  }));

  function doRequest(i) {
    http.get({
      port: server.address().port,
      path: `/request${i}`,
    }, common.mustCall((res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', common.mustCall(() => {
        assert.strictEqual(data, `/request${i}`);
        countdown.dec();
      }));
    }));
  }
}));
