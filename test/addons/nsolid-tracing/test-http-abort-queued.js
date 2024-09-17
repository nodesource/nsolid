// Flags: --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const assert = require('assert');
const http = require('http');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

let complete;

function setupTracesCheck(port, addresses) {
  const expectedTraces = [
    {
      attributes: {
        'http.method': 'GET',
        'http.status_code': 200,
        'http.status_text': 'OK',
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
    {
      attributes: {
        'http.method': 'GET',
        'http.url': `http://localhost:${port}/thatotherone`,
      },
      end_reason: binding.kSpanEndError,
      name: 'HTTP GET',
      parentId: '0000000000000000',
      thread_id: 0,
      kind: binding.kClient,
      type: binding.kSpanHttpClient,
    },
  ];

  checkTracesOnExit(binding, expectedTraces);
}

setupNSolid(common.mustSucceed(({ addresses }) => {
  const server = http.createServer(common.mustCall((req, res) => {
    // We should not see the queued /thatotherone request within the server
    // as it should be aborted before it is sent.
    assert.strictEqual(req.url, '/');

    res.writeHead(200);
    res.write('foo');

    complete = complete || function() {
      res.end();
    };
  }));

  server.listen(0, common.mustCall(() => {
    const agent = new http.Agent({ maxSockets: 1 });
    assert.strictEqual(Object.keys(agent.sockets).length, 0);
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    const options = {
      hostname: 'localhost',
      port,
      method: 'GET',
      path: '/',
      agent: agent,
    };

    const req1 = http.request(options);
    req1.on('response', (res1) => {
      assert.strictEqual(Object.keys(agent.sockets).length, 1);
      assert.strictEqual(Object.keys(agent.requests).length, 0);

      const req2 = http.request({
        method: 'GET',
        host: 'localhost',
        port: server.address().port,
        path: '/thatotherone',
        agent: agent,
      });
      assert.strictEqual(Object.keys(agent.sockets).length, 1);
      assert.strictEqual(Object.keys(agent.requests).length, 1);

      // TODO(jasnell): This event does not appear to currently be triggered.
      // is this handler actually required?
      req2.on('error', (err) => {
        // This is expected in response to our explicit abort call
        assert.strictEqual(err.code, 'ECONNRESET');
      });

      req2.end();
      req2.abort();

      assert.strictEqual(Object.keys(agent.sockets).length, 1);
      assert.strictEqual(Object.keys(agent.requests).length, 1);

      res1.on('data', (chunk) => complete());

      res1.on('end', common.mustCall(() => {
        setTimeout(common.mustCall(() => {
          assert.strictEqual(Object.keys(agent.sockets).length, 0);
          assert.strictEqual(Object.keys(agent.requests).length, 0);

          server.close();
        }), 100);
      }));
    });

    req1.end();
  }));
}));
