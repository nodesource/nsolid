'use strict';

const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const http = require('http');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

function setupTracesCheck(port, addresses) {
  const expectedTraces = [
    {
      attributes: {
        'http.error_message': 'I destroyed myself',
        'http.error_name': 'Error',
        'http.method': 'GET',
        'http.url': `http://localhost:${port}/`,
      },
      end_reason: binding.kSpanEndError,
      events: [
        {
          attributes: {
            'exception.message': 'I destroyed myself',
            'exception.type': 'Error',
          },
          name: 'exception',
        },
      ],
      name: 'HTTP GET',
      parentId: '0000000000000000',
      thread_id: 0,
      kind: binding.kClient,
      status: {
        code: 2, // ERROR
        message: 'I destroyed myself',
      },
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

const server = http.Server(common.mustCall((req, res) => {
  res.writeHead(200);
  res.write('Part of my res.');
  setTimeout(() => {
    res.end();
  }, 1000);
}));

setupNSolid(common.mustSucceed(({ addresses }) => {
  server.listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    http.get({
      port,
      headers: { connection: 'keep-alive' },
    }, common.mustCall((res) => {
      server.close();

      res.resume();
      res.on('end', common.mustCall());
      res.on('close', common.mustCall());
      res.on('error', common.expectsError({
        message: 'I destroyed myself',
      }));
      res.socket.on('close', common.mustCall());
      res.emit('error', new Error('I destroyed myself'));
    }));
  }));
}));
