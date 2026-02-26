// Flags: --expose-internals
'use strict';

const common = require('../common');
const assert = require('assert');
const dc = require('diagnostics_channel');
const { internalBinding } = require('internal/test/binding');
const binding = internalBinding('nsolid_api');
require('internal/nsolid_diag');

const original = binding.pushClientBucket;
const cases = [
  ['http', 'api.example.com:8080', 'api.example.com', 8080, 200],
  ['https', 'other.example.com', 'other.example.com', 443, 503],
  ['http', '[::1]:8080', '[::1]', 8080, 200],
  [undefined, 'tunnel.example.com:8443', 'tunnel.example.com', 8443, 200],
  ['http', 'host.example.com', 'host.example.com', 80, 200, true],
  ['https', 'pushed.example.com:8443', 'pushed.example.com', 8443, 200, false, true],
];

try {
  for (const [scheme, authority, host, port, status, useHost, pushed] of cases) {
    binding.pushClientBucket = common.mustCall((duration, method, code,
                                                address, serverPort) => {
      assert.strictEqual(method, scheme ? binding.nsolid_consts.kHttpMethodGet :
        binding.nsolid_consts.kHttpMethodConnect);
      assert.strictEqual(code, status);
      assert.strictEqual(address, host);
      assert.strictEqual(serverPort, port);
    });
    const headers = {
      ':method': scheme ? 'GET' : 'CONNECT',
      ':scheme': scheme,
      [useHost ? 'host' : ':authority']: authority,
    };
    const stream = {
      sentHeaders: pushed ? undefined : headers,
      session: { socket: { remoteAddress: '127.0.0.1', remotePort: 9000 } },
    };
    dc.channel('http2.client.stream.created').publish({ stream, headers });
    dc.channel('http2.client.stream.finish').publish({
      stream,
      headers: { ':status': status },
    });
    stream.session = undefined;
    dc.channel('http2.client.stream.close').publish({ stream, code: 0 });
  }
} finally {
  binding.pushClientBucket = original;
}
