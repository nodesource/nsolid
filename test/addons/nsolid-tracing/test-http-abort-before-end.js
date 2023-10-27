// Flags: --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const http = require('http');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

function setupTracesCheck(port) {
  const expectedTraces = [
    {
      attributes: {
        'http.method': 'GET',
        'http.url': `http://127.0.0.1:${port}/`,
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

setupNSolid(common.mustCall(() => {
  const server = http.createServer(common.mustNotCall());

  server.listen(0, common.mustCall(() => {
    const port = server.address().port;
    setupTracesCheck(port);
    const req = http.request({
      method: 'GET',
      host: '127.0.0.1',
      port,
    });

    req.on('abort', common.mustCall(() => {
      server.close();
    }));

    req.on('error', common.mustNotCall());

    req.abort();
    req.end();
  }));
}));
