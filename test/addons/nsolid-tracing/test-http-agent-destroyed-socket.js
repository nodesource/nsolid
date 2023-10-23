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
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello World\n');
  }, 2)).listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    const agent = new http.Agent({ maxSockets: 1 });

    agent.on('free', common.mustCall(3));

    const requestOptions = {
      agent: agent,
      host: 'localhost',
      port,
      path: '/',
    };

    const request1 = http.get(requestOptions, common.mustCall((response) => {
      // Assert request2 is queued in the agent
      const key = agent.getName(requestOptions);
      assert.strictEqual(agent.requests[key].length, 1);
      response.resume();
      response.on('end', common.mustCall(() => {
        request1.socket.destroy();

        request1.socket.once('close', common.mustCall(() => {
          // Assert request2 was removed from the queue
          assert(!agent.requests[key]);
          process.nextTick(() => {
            // Assert that the same socket was not assigned to request2,
            // since it was destroyed.
            assert.notStrictEqual(request1.socket, request2.socket);
            assert(!request2.socket.destroyed, 'the socket is destroyed');
          });
        }));
      }));
    }));

    const request2 = http.get(requestOptions, common.mustCall((response) => {
      assert(!request2.socket.destroyed);
      assert(request1.socket.destroyed);
      // Assert not reusing the same socket, since it was destroyed.
      assert.notStrictEqual(request1.socket, request2.socket);
      const countdown = new Countdown(2, () => server.close());
      request2.socket.on('close', common.mustCall(() => countdown.dec()));
      response.on('end', common.mustCall(() => countdown.dec()));
      response.resume();
    }));
  }));
}));
