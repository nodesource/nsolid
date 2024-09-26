// Flags: --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const http = require('http');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

setupNSolid(common.mustCall(() => {

  // Sending `agent: false` when `port: null` is also passed in (i.e. the result
  // of a `url.parse()` call with the default port used, 80 or 443), should not
  // result in an assertion error...
  const opts = {
    host: '127.0.0.1',
    port: null,
    path: '/',
    method: 'GET',
    agent: false,
  };

  // We just want an "error" (no local HTTP server on port 80) or "response"
  // to happen (user happens ot have HTTP server running on port 80).
  // As long as the process doesn't crash from a C++ assertion then we're good.
  const req = http.request(opts);

  // Will be called by either the response event or error event, not both
  const oneResponse = common.mustCall();
  req.on('response', () => {
    oneResponse();
    const expectedTraces = [
      {
        attributes: {
          'http.method': 'GET',
          'http.status_code': 200,
          'http.status_text': 'OK',
          'http.url': 'http://127.0.0.1/',
        },
        end_reason: binding.kSpanEndOk,
        name: 'HTTP GET',
        parentId: '0000000000000000',
        thread_id: 0,
        kind: binding.kClient,
        type: binding.kSpanHttpClient,
      },
    ];

    checkTracesOnExit(binding, expectedTraces);
  });
  req.on('error', () => {
    oneResponse();
    const expectedTraces = [
      {
        attributes: {
          'http.method': 'GET',
          'http.url': 'http://127.0.0.1/',
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
  });
  req.end();
}));
