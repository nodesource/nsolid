// Flags: --dns-result-order=ipv4first
'use strict';

// Similar to test-otel-http.js but creating a child span on http.get cb
//
// In this case, there's a single trace with 5 spans:
//
// before_req
//     |-----> HTTP GET (client)
//     |            |-----> DNS lookup
//     |            |-----> HTTP GET (server)
//     |-----> child

const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const { fixturesDir } = require('../../common/fixtures');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const http = require('http');
const nsolid = require('nsolid');
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixturesDir] }));

function setupTracesCheck(port, addresses) {
  const expectedTraces = [
    {
      'attributes': {},
      'children': [
        {
          'attributes': {
            'http.method': 'GET',
            'http.status_code': 200,
            'http.status_text': 'OK',
            'http.url': `http://localhost:${port}/`,
          },
          'children': [
            {
              'attributes': {
                'dns.address': [{ address: addresses[0].address,
                                  family: addresses[0].family }],
                'dns.hostname': 'localhost',
                'dns.op_type': 0,
              },
              'end_reason': 0,
              'events': [],
              'name': 'DNS lookup',
              'thread_id': 0,
              'type': 1,
            },
            {
              'attributes': {
                'http.method': 'GET',
                'http.status_code': 200,
                'http.status_text': 'OK',
                'http.url': `http://localhost:${port}/`,
              },
              'end_reason': 0,
              'events': [],
              'name': 'HTTP GET',
              'thread_id': 0,
              'type': 8,
            },
          ],
          'end_reason': 0,
          'events': [],
          'name': 'HTTP GET',
          'thread_id': 0,
          'type': 4,
        },
        {
          'end_reason': 0,
          'name': 'child',
          'thread_id': 0,
          'type': 16,
        },
      ],
      'end_reason': 0,
      'events': [],
      'name': 'before req',
      'thread_id': 0,
      'type': 16,
    },
  ];

  checkTracesOnExit(binding, expectedTraces);
}

setupNSolid(common.mustSucceed(({ addresses }) => {
  if (!nsolid.otel.register(api)) {
    throw new Error('Error registering api');
  }

  const tracer = api.trace.getTracer('test');

  const server = http.createServer((req, res) => {
    res.end();
  });

  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    setupTracesCheck(port, addresses);
    const u = `http://localhost:${port}`;
    const span = tracer.startSpan('before req');
    const activeContext = api.trace.setSpan(api.context.active(), span);
    api.context.with(activeContext, () => {
      const req = http.get(u, () => {
        const child = tracer.startSpan('child');
        req.on('close', () => {
          server.close();
          child.end();
          span.end();
        });
      });
    });
  });
}));
