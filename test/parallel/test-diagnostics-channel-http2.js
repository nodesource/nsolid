// Flags: --expose-internals
'use strict';
const common = require('../common');
if (!common.hasCrypto)
  common.skip('missing crypto');
const assert = require('assert');
const http2 = require('http2');
const { Http2Session, Http2Stream } = require('internal/http2/core');
const dc = require('diagnostics_channel');

const isClientHttp2Stream = (stream) => {
  return stream instanceof Http2Stream &&
         stream.session instanceof Http2Session &&
         stream.session.type === http2.constants.NGHTTP2_SESSION_CLIENT;
};

const isServerHttp2Stream = (stream) => {
  return stream instanceof Http2Stream &&
         stream.session instanceof Http2Session &&
         stream.session.type === http2.constants.NGHTTP2_SESSION_SERVER;
};

const isError = (error) => error instanceof Error;

const isValidHeaders = (headers) => {
  return headers && !Array.isArray(headers) && typeof headers === 'object';
};

dc.subscribe('http2.client.stream.created', common.mustCall(({ stream, headers }) => {
  assert.strictEqual(isClientHttp2Stream(stream), true);
  assert.strictEqual(isValidHeaders(headers), true);
}, 2));

dc.subscribe('http2.client.stream.start', common.mustCall(({ stream, headers }) => {
  assert.strictEqual(isClientHttp2Stream(stream), true);
  assert.strictEqual(isValidHeaders(headers), true);
}, 2));

dc.subscribe('http2.client.stream.error', common.mustCall(({ stream, error }) => {
  assert.strictEqual(isClientHttp2Stream(stream), true);
  assert.strictEqual(isError(error), true);
}));

dc.subscribe('http2.client.stream.finish', common.mustCall(({ stream, headers }) => {
  assert.strictEqual(isClientHttp2Stream(stream), true);
  assert.strictEqual(isValidHeaders(headers), true);
}));

dc.subscribe('http2.client.stream.close', common.mustCall(({ stream, code }) => {
  assert.strictEqual(isClientHttp2Stream(stream), true);
  assert.strictEqual(Number.isInteger(code), true);
}, 2));

dc.subscribe('http2.server.stream.start', common.mustCall(({ stream, headers }) => {
  assert.strictEqual(isServerHttp2Stream(stream), true);
  assert.strictEqual(isValidHeaders(headers), true);
}, 2));

dc.subscribe('http2.server.stream.error', common.mustCall(({ stream, error }) => {
  assert.strictEqual(isServerHttp2Stream(stream), true);
  assert.strictEqual(isError(error), true);
}));

dc.subscribe('http2.server.stream.finish', common.mustCall(({ stream, headers }) => {
  assert.strictEqual(isServerHttp2Stream(stream), true);
  assert.strictEqual(isValidHeaders(headers), true);
}));

dc.subscribe('http2.server.stream.close', common.mustCall(({ stream, code }) => {
  assert.strictEqual(isServerHttp2Stream(stream), true);
  assert.strictEqual(Number.isInteger(code), true);
}, 2));

let destroy = false;
const server = http2.createServer();
server.on('stream', common.mustCall((stream, headers, flags) => {
  if (destroy) {
    stream.on('error', common.mustCall());
    stream.session.destroy(new Error('destroyed'));
  } else {
    stream.respond({ 'content-type': 'text/html' });
    stream.end('test');
  }
}, 2));


server.listen(0, common.mustCall(() => {
  const port = server.address().port;
  const client = http2.connect(`http://localhost:${port}`);

  const req = client.request();

  req.on('response', common.mustCall((headers) => {
    assert.strictEqual(headers[':status'], 200);
    assert.strictEqual(headers['content-type'], 'text/html');
  }));

  let data = '';

  req.setEncoding('utf8');
  req.on('data', common.mustCallAtLeast((d) => data += d));
  req.on('end', common.mustCall(() => {
    destroy = true;
    client.on('close', common.mustCall(() => {
      server.close();
    }));
    client.on('error', common.mustCall((err) => {
      assert.strictEqual(err.message, 'Session closed with error code 2');
    }));

    client.request().on('error', common.mustCall((err) => {
      assert.strictEqual(err.message, 'Session closed with error code 2');
    }));
  }));
}));
