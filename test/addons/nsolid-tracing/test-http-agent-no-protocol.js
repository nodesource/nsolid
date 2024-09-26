// Flags: --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const http = require('http');
const url = require('url');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

function setupTracesCheck(port) {
  const expectedTraces = [
    {
      attributes: {
        'http.method': 'GET',
        'http.status_code': 200,
        'http.status_text': 'OK',
        'http.url': `http://127.0.0.1:${port}/`,
      },
      end_reason: binding.kSpanEndOk,
      thread_id: 0,
      kind: binding.kClient,
      type: binding.kSpanHttpClient,
      children: [
        {
          attributes: {
            'http.method': 'GET',
            'http.status_code': 200,
            'http.status_text': 'OK',
            'http.url': `http://127.0.0.1:${port}/`,
          },
          end_reason: binding.kSpanEndOk,
          thread_id: 0,
          kind: binding.kServer,
          type: binding.kSpanHttpServer,
        },
      ],
    },
  ];

  checkTracesOnExit(binding, expectedTraces);
}

setupNSolid(common.mustCall(() => {
  const server = http.createServer(common.mustCall((req, res) => {
    res.end();
  })).listen(0, '127.0.0.1', common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port);
    const opts = url.parse(`http://127.0.0.1:${port}/`);

    // Remove the `protocol` field… the `http` module should fall back
    // to "http:", as defined by the global, default `http.Agent` instance.
    opts.agent = new http.Agent();
    opts.agent.protocol = null;

    http.get(opts, common.mustCall((res) => {
      res.resume();
      server.close();
    }));
  }));
}));
