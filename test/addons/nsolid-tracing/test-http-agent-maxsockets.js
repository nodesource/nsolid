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
        },
      ],
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
  ];

  checkTracesOnExit(binding, expectedTraces);
}

const agent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 2,
  maxFreeSockets: 2,
});

const server = http.createServer(common.mustCall((req, res) => {
  res.end('hello world');
}, 2));

server.keepAliveTimeout = 0;

function get(path, callback) {
  return http.get({
    host: 'localhost',
    port: server.address().port,
    agent: agent,
    path: path,
  }, callback);
}

const countdown = new Countdown(2, () => {
  const freepool = agent.freeSockets[Object.keys(agent.freeSockets)[0]];
  assert.strictEqual(freepool.length, 2,
                     `expect keep 2 free sockets, but got ${freepool.length}`);
  agent.destroy();
  server.close();
});

function dec() {
  process.nextTick(() => countdown.dec());
}

function onGet(res) {
  assert.strictEqual(res.statusCode, 200);
  res.resume();
  res.on('end', common.mustCall(dec));
}

setupNSolid(common.mustSucceed(({ addresses }) => {
  server.listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    get('/1', common.mustCall(onGet));
    get('/2', common.mustCall(onGet));
  }));
}));
