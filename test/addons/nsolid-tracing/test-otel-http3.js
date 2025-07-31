// Flags: --dns-result-order=ipv4first
'use strict';

// In this case only an auto-instrumented http server is tested (the net module
// is used to send the http request). The http server is created inside the cb
// of a api.context.with(ctxt) method with `ctxt` containing a parent span.
// Check that the HTTP server span doesn't have a parent even though is created
// with the ctxt as active context, the reason being that an http span takes the
// current context from the http request traceparent header, which is not set at
// this time. (At least this is what @opentelemetry/instrumentation-http does at
// the moment)
//
// The traces graph should be:
//
// before server
//      |-----> DNS lookup
//
// HTTP GET (server)

const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const { fixturesDir } = require('../../common/fixtures');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const http = require('http');
const net = require('net');
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
      ],
      'end_reason': 0,
      'events': [],
      'name': 'before server',
      'thread_id': 0,
      'type': 16,
    },
    {
      'attributes': {
        'http.method': 'GET',
        'http.status_code': 200,
        'http.status_text': 'OK',
        'http.url': 'http://localhost/',
      },
      'end_reason': 0,
      'events': [],
      'name': 'HTTP GET',
      'parentId': '0000000000000000',
      'thread_id': 0,
      'type': 8,
    },
  ];

  checkTracesOnExit(binding, expectedTraces);
}

setupNSolid(common.mustSucceed(({ addresses }) => {
  if (!nsolid.otel.register(api)) {
    throw new Error('Error registering api');
  }

  const tracer = api.trace.getTracer('test');

  const span = tracer.startSpan('before server');
  const activeContext = api.trace.setSpan(api.context.active(), span);
  api.context.with(activeContext, () => {
    const server = http.createServer((req, res) => {
      res.end();
      server.close();
      span.end();
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      setupTracesCheck(port, addresses);
      const client = net.connect(server.address().port, () => {
        client.end('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
      });
    });
  });
}));
