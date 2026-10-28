'use strict';

const common = require('../common');
const assert = require('assert');
const { channel } = require('diagnostics_channel');
const { getEventListeners } = require('events');
const http = require('http');
const { setImmediate } = require('timers/promises');
// Exercise the vendored bundle without depending on an older embedded copy.
const { fetch } = require('../../deps/undici/undici');

const requests = 12;
const server = http.createServer(common.mustCall((req, res) => {
  res.end('ok');
}, requests * 2));

server.listen(0, '127.0.0.1', common.mustCall(async () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  const start = channel('tracing:undici:fetch:start');
  const onStart = common.mustCall((context) => {
    assert.strictEqual(context.input, url);
  }, requests);
  try {
    for (const tracing of [false, true]) {
      if (tracing) start.subscribe(onStart);
      const { signal } = new AbortController();
      for (let i = 0; i < requests; i++) {
        const response = await fetch(url, { signal });
        assert.strictEqual(await response.text(), 'ok');
        await setImmediate();
        assert.strictEqual(getEventListeners(signal, 'abort').length, 0);
      }
    }
  } finally {
    start.unsubscribe(onStart);
    server.closeAllConnections();
    server.close();
  }
}));
