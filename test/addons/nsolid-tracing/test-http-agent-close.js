// Flags: --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { fixturesDir } = require('../../common/fixtures');
const { setupNSolid } = require('./utils');
const assert = require('assert');
const http = require('http');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixturesDir] }));

const expectedTraces = [
  {
    attributes: {
      'http.error_message': 'kaboom',
      'http.error_name': 'Error',
      'http.method': 'GET',
      'http.url': 'http://localhost/',
    },
    events: [
      {
        attributes: {
          'exception.message': 'kaboom',
          'exception.type': 'Error',
        },
        name: 'exception',
      },
    ],
    end_reason: binding.kSpanEndError,
    thread_id: 0,
    kind: binding.kClient,
    status: {
      code: api.SpanStatusCode.ERROR,
      message: 'kaboom',
    },
    type: binding.kSpanHttpClient,
  },
];

checkTracesOnExit(binding, expectedTraces);

setupNSolid(common.mustCall(() => {
  const agent = new http.Agent();
  const _err = new Error('kaboom');
  agent.createSocket = function(req, options, cb) {
    cb(_err);
  };

  const req = http
    .request({
      agent,
    })
    .on('error', common.mustCall((err) => {
      assert.strictEqual(err, _err);
    }))
    .on('close', common.mustCall(() => {
      assert.strictEqual(req.destroyed, true);
    }));
}));
