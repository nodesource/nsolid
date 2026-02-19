// Flags: --expose-internals
'use strict';

require('../common');
const assert = require('assert');
const dc = require('diagnostics_channel');
const { internalBinding } = require('internal/test/binding');
const binding = internalBinding('nsolid_api');
const {
  kHttpMethodGet,
  kHttpVersion11,
  kHttpVersion2,
  kHttpVersionOther,
} = binding.nsolid_consts;
require('internal/nsolid_diag');

const original = binding.pushClientBucket;
const points = [];
binding.pushClientBucket = (...args) => points.push(args);

function checkPoint(expected) {
  assert.strictEqual(points.length, 1);
  const [duration, ...attributes] = points.pop();
  assert.ok(Number.isFinite(duration) && duration >= 0);
  assert.deepStrictEqual(attributes, expected);
}

try {
  for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', undefined, 42]) {
    const request = {
      method: 'GET',
      host: 'api.example.com',
      [binding.nsolid_tracer_s]: 0,
    };
    const error = { code };
    dc.channel('http.client.request.error').publish({ request, error });
    dc.channel('http.client.request.error').publish({ request, error });
    checkPoint([kHttpMethodGet, 0, 'api.example.com', 0, kHttpVersionOther,
                typeof code === 'string' ? code : 'Error']);
  }

  // A response was already recorded, or the request was never started.
  for (const request of [
    { res: { statusCode: 200 }, [binding.nsolid_tracer_s]: 0 },
    {},
  ]) {
    dc.channel('http.client.request.error').publish({
      request, error: { code: 'ECONNRESET' },
    });
    assert.strictEqual(points.length, 0);
  }

  for (const origin of ['http://api.example.com:8080', 'invalid origin']) {
    const request = { origin, method: 'GET', [binding.nsolid_tracer_s]: 0 };
    const error = { code: 'UND_ERR_CONNECT_TIMEOUT' };
    dc.channel('undici:request:error').publish({ request, error });
    dc.channel('undici:request:error').publish({ request, error });
    checkPoint([kHttpMethodGet, 0, origin === 'invalid origin' ? '' : 'api.example.com',
                origin === 'invalid origin' ? 0 : 8080, kHttpVersionOther,
                'UND_ERR_CONNECT_TIMEOUT']);
  }

  const request = {
    origin: 'http://api.example.com',
    method: 'GET',
    [binding.nsolid_tracer_s]: 0,
    [binding.nsolid_net_prot_s]: kHttpVersion11,
  };
  dc.channel('undici:request:headers').publish({ request, response: { statusCode: 200 } });
  dc.channel('undici:request:error').publish({ request, error: { code: 'UND_ERR_SOCKET' } });
  checkPoint([kHttpMethodGet, 200, 'api.example.com', 80, kHttpVersion11]);

  // Without sendHeaders, protocol attribution is unknown.
  for (const statusCode of [200, 503]) {
    const request = {
      origin: 'http://api.example.com',
      method: 'GET',
      [binding.nsolid_tracer_s]: 0,
    };
    dc.channel('undici:request:headers').publish({ request, response: { statusCode } });
    const expected = [kHttpMethodGet, statusCode, 'api.example.com', 80, kHttpVersionOther];
    if (statusCode >= 400) expected.push(String(statusCode));
    checkPoint(expected);
  }

  for (const statusCode of [200, undefined]) {
    const request = {
      origin: 'http://api.example.com',
      method: 'GET',
      [binding.nsolid_tracer_s]: 0,
      [binding.nsolid_net_prot_s]: kHttpVersion11,
    };
    dc.channel('undici:request:headers').publish({ request, response: { statusCode: 103 } });
    assert.strictEqual(points.length, 0);
    if (statusCode) {
      dc.channel('undici:request:headers').publish({ request, response: { statusCode } });
      checkPoint([kHttpMethodGet, 200, 'api.example.com', 80, kHttpVersion11]);
    } else {
      dc.channel('undici:request:error').publish({ request, error: { code: 'UND_ERR_SOCKET' } });
      checkPoint([kHttpMethodGet, 0, 'api.example.com', 80, kHttpVersion11, 'UND_ERR_SOCKET']);
    }
  }

  for (const error of [{ code: 'ERR_HTTP2_STREAM_CANCEL' }, undefined]) {
    const stream = {};
    dc.channel('http2.client.stream.created').publish({
      stream,
      headers: { ':method': 'GET', ':scheme': 'http', ':authority': 'api.example.com:8080' },
    });
    if (error) dc.channel('http2.client.stream.error').publish({ stream, error });
    dc.channel('http2.client.stream.close').publish({ stream, code: 8 });
    checkPoint([kHttpMethodGet, 0, 'api.example.com', 8080, kHttpVersion2,
                error?.code || 'ERR_HTTP2_STREAM_ERROR']);
  }
} finally {
  binding.pushClientBucket = original;
}
