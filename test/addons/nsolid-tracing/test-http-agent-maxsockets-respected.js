// Flags: --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const Countdown = require('../../common/countdown');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

// This test ensures that the `maxSockets` value for `http.Agent` is respected.
// https://github.com/nodejs/node/issues/4050

const assert = require('assert');
const http = require('http');

const MAX_SOCKETS = 2;
const TOTAL_SOCKETS = 6;

function setupTracesCheck(port, addresses) {
  const expectedTraces = new Array(TOTAL_SOCKETS);
  expectedTraces.fill({
    attributes: {
      'http.method': 'GET',
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.url': `http://localhost:${port}/1`,
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
  }, 0, TOTAL_SOCKETS);

  checkTracesOnExit(binding, expectedTraces);
}

const agent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: MAX_SOCKETS,
  maxFreeSockets: MAX_SOCKETS,
});


const server = http.createServer(
  common.mustCall((req, res) => {
    res.end('hello world');
  }, TOTAL_SOCKETS),
);

const countdown = new Countdown(TOTAL_SOCKETS, () => server.close());

function get(path, callback) {
  return http.get(
    {
      host: 'localhost',
      port: server.address().port,
      agent: agent,
      path: path,
    },
    callback,
  );
}

setupNSolid(common.mustSucceed(({ addresses }) => {
  server.listen(
    0,
    common.mustCall(() => {
      const port = server.address().port;
      setupTracesCheck(port, addresses);
      for (let i = 0; i < TOTAL_SOCKETS; i++) {
        const request = get('/1', common.mustCall());
        request.on(
          'response',
          common.mustCall(() => {
            request.abort();
            const sockets = agent.sockets[Object.keys(agent.sockets)[0]];
            assert(sockets.length <= MAX_SOCKETS);
            countdown.dec();
          }),
        );
      }
    }),
  );
}));
