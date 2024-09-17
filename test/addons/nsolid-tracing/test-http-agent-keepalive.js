// Flags: --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const assert = require('assert');
const http = require('http');
const Agent = require('_http_agent').Agent;
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

let name;

function setupTracesCheck(port, addresses) {
  const expectedTraces = [
    {
      attributes: {
        'http.method': 'GET',
        'http.status_code': 200,
        'http.status_text': 'OK',
        'http.url': `http://localhost:${port}/first`,
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
            'http.url': `http://localhost:${port}/first`,
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
        'http.url': `http://localhost:${port}/second`,
      },
      end_reason: binding.kSpanEndOk,
      name: 'HTTP GET',
      thread_id: 0,
      kind: binding.kClient,
      type: binding.kSpanHttpClient,
      children: [
        {
          attributes: {
            'http.method': 'GET',
            'http.status_code': 200,
            'http.status_text': 'OK',
            'http.url': `http://localhost:${port}/second`,
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
        'http.url': `http://localhost:${port}/remote_close`,
      },
      end_reason: binding.kSpanEndOk,
      name: 'HTTP GET',
      thread_id: 0,
      kind: binding.kClient,
      type: binding.kSpanHttpClient,
      children: [
        {
          attributes: {
            'http.method': 'GET',
            'http.status_code': 200,
            'http.status_text': 'OK',
            'http.url': `http://localhost:${port}/remote_close`,
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
        'http.url': `http://localhost:${port}/error`,
      },
      end_reason: binding.kTraceEndError,
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
            'http.url': `http://localhost:${port}/error`,
          },
          end_reason: binding.kTraceEndError,
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

  const agent = new Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 5,
    maxFreeSockets: 5,
  });

  const server = http.createServer(common.mustCall((req, res) => {
    if (req.url === '/error') {
      res.destroy();
      return;
    } else if (req.url === '/remote_close') {
      // Cache the socket, close it after a short delay
      const socket = res.connection;
      setImmediate(common.mustCall(() => socket.end()));
    }
    res.end('hello world');
  }, 4));

  function get(path, callback) {
    return http.get({
      host: 'localhost',
      port: server.address().port,
      agent: agent,
      path: path,
    }, callback).on('socket', common.mustCall(checkListeners));
  }

  function checkDataAndSockets(body) {
    assert.strictEqual(body.toString(), 'hello world');
    assert.strictEqual(agent.sockets[name].length, 1);
    assert.strictEqual(agent.freeSockets[name], undefined);
  }

  function second() {
    // Request second, use the same socket
    const req = get('/second', common.mustCall((res) => {
      assert.strictEqual(req.reusedSocket, true);
      assert.strictEqual(res.statusCode, 200);
      res.on('data', checkDataAndSockets);
      res.on('end', common.mustCall(() => {
        assert.strictEqual(agent.sockets[name].length, 1);
        assert.strictEqual(agent.freeSockets[name], undefined);
        process.nextTick(common.mustCall(() => {
          assert.strictEqual(agent.sockets[name], undefined);
          assert.strictEqual(agent.freeSockets[name].length, 1);
          remoteClose();
        }));
      }));
    }));
  }

  function remoteClose() {
    // Mock remote server close the socket
    const req = get('/remote_close', common.mustCall((res) => {
      assert.strictEqual(req.reusedSocket, true);
      assert.strictEqual(res.statusCode, 200);
      res.on('data', checkDataAndSockets);
      res.on('end', common.mustCall(() => {
        assert.strictEqual(agent.sockets[name].length, 1);
        assert.strictEqual(agent.freeSockets[name], undefined);
        process.nextTick(common.mustCall(() => {
          assert.strictEqual(agent.sockets[name], undefined);
          assert.strictEqual(agent.freeSockets[name].length, 1);
          // Waiting remote server close the socket
          setTimeout(common.mustCall(() => {
            assert.strictEqual(agent.sockets[name], undefined);
            assert.strictEqual(agent.freeSockets[name], undefined);
            remoteError();
          }), common.platformTimeout(200));
        }));
      }));
    }));
  }

  function remoteError() {
    // Remote server will destroy the socket
    const req = get('/error', common.mustNotCall());
    req.on('error', common.mustCall((err) => {
      assert(err);
      assert.strictEqual(err.message, 'socket hang up');
      assert.strictEqual(agent.sockets[name].length, 1);
      assert.strictEqual(agent.freeSockets[name], undefined);
      // Wait socket 'close' event emit
      setTimeout(common.mustCall(() => {
        assert.strictEqual(agent.sockets[name], undefined);
        assert.strictEqual(agent.freeSockets[name], undefined);
        server.close();
      }), common.platformTimeout(1));
    }));
  }

  server.listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    name = `localhost:${port}:`;
    // Request first, and keep alive
    const req = get('/first', common.mustCall((res) => {
      assert.strictEqual(req.reusedSocket, false);
      assert.strictEqual(res.statusCode, 200);
      res.on('data', checkDataAndSockets);
      res.on('end', common.mustCall(() => {
        assert.strictEqual(agent.sockets[name].length, 1);
        assert.strictEqual(agent.freeSockets[name], undefined);
        process.nextTick(common.mustCall(() => {
          assert.strictEqual(agent.sockets[name], undefined);
          assert.strictEqual(agent.freeSockets[name].length, 1);
          second();
        }));
      }));
    }));
  }));

  // Check for listener leaks when reusing sockets.
  function checkListeners(socket) {
    const callback = common.mustCall(() => {
      if (!socket.destroyed) {
        assert.strictEqual(socket.listenerCount('data'), 0);
        assert.strictEqual(socket.listenerCount('drain'), 0);
        // Sockets have freeSocketErrorListener.
        assert.strictEqual(socket.listenerCount('error'), 1);
        // Sockets have onReadableStreamEnd.
        assert.strictEqual(socket.listenerCount('end'), 1);
      }

      socket.off('free', callback);
      socket.off('close', callback);
    });
    assert.strictEqual(socket.listenerCount('error'), 1);
    assert.strictEqual(socket.listenerCount('end'), 2);
    socket.once('free', callback);
    socket.once('close', callback);
  }
}));
