// Flags: --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const assert = require('assert');
const http = require('http');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const maxSize = 1024;
let size = 0;

function setupTracesCheck(port, addresses) {
  const expectedTraces = [
    {
      attributes: {
        'http.method': 'GET',
        'http.status_code': 200,
        'http.status_text': 'OK',
        'http.url': `http://localhost:${port}/`,
      },
      end_reason: binding.kSpanEndError,
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
  ];

  checkTracesOnExit(binding, expectedTraces);
}

setupNSolid(common.mustSucceed(({ addresses }) => {
  const server = http.createServer(common.mustCall((req, res) => {
    server.close();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    for (let i = 0; i < maxSize; i++) {
      res.write(`x${i}`);
    }
    res.end();
  }));

  server.listen(0, () => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    const res = common.mustCall((res) => {
      res.on('data', (chunk) => {
        size += chunk.length;
        assert(!req.aborted, 'got data after abort');
        if (size > maxSize) {
          req.abort();
          assert.strictEqual(req.aborted, true);
          size = maxSize;
        }
      });

      req.on('abort', common.mustCall(() => assert.strictEqual(size, maxSize)));
      assert.strictEqual(req.aborted, false);
    });

    const req = http.get(`http://localhost:${port}`, res);
  });
}));
