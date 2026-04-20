// Flags: --expose-internals
import * as common from '../common/index.mjs';
if (!common.hasCrypto)
  common.skip('missing crypto');
import assert from 'assert';
import * as h2 from 'http2';
import util from 'internal/http2/util';
import { getEventListeners } from 'events';
import nsolid from 'nsolid';

const kSocket = util.kSocket;

let httpClientAbortCount = 0;
let httpServerAbortCount = 0;

const tests = [];

function testDestroyBeforeClientOperations() {
  return new Promise((resolve) => {
    const server = h2.createServer();
    server.once('listening', common.mustCall(() => {
      const client = h2.connect(`http://localhost:${server.address().port}`);
      const socket = client[kSocket];
      socket.on('close', common.mustCall(() => {
        assert(socket.destroyed);
      }));

      const req = client.request();
      req.on('error', common.expectsError({
        code: 'ERR_HTTP2_STREAM_CANCEL',
        name: 'Error',
        message: 'The pending stream has been canceled'
      }));

      client.destroy();

      req.on('response', common.mustNotCall());

      const sessionError = {
        name: 'Error',
        code: 'ERR_HTTP2_INVALID_SESSION',
        message: 'The session has been destroyed'
      };

      assert.throws(() => client.setNextStreamID(), sessionError);
      assert.throws(() => client.setLocalWindowSize(), sessionError);
      assert.throws(() => client.ping(), sessionError);
      assert.throws(() => client.settings({}), sessionError);
      assert.throws(() => client.goaway(), sessionError);
      assert.throws(() => client.request(), sessionError);
      client.close();  // Should be a non-op at this point

      // Wait for setImmediate call from destroy() to complete
      // so that state.destroyed is set to true
      setImmediate(common.mustCall(() => {
        assert.throws(() => client.setNextStreamID(), sessionError);
        assert.throws(() => client.setLocalWindowSize(), sessionError);
        assert.throws(() => client.ping(), sessionError);
        assert.throws(() => client.settings({}), sessionError);
        assert.throws(() => client.goaway(), sessionError);
        assert.throws(() => client.request(), sessionError);
        client.close();  // Should be a non-op at this point
      }));

      req.resume();
      req.on('end', common.mustNotCall());
      req.on('close', common.mustCall(() => {
        server.close();
        httpClientAbortCount++;
        resolve();
      }));
    }));
    server.listen(0);
  });
}

function testDestroyBeforeGoaway() {
  return new Promise((resolve) => {
    const server = h2.createServer();
    server.on('stream', common.mustCall((stream) => {
      stream.session.destroy();
    }));

    server.once('listening', common.mustCall(() => {
      const client = h2.connect(`http://localhost:${server.address().port}`);

      client.on('close', common.mustCall(() => {
        server.close();
        // Calling destroy in here should not matter
        client.destroy();
        httpClientAbortCount++;
        httpServerAbortCount++;
        resolve();
      }));

      client.request();
    }));
    server.listen(0);
  });
}

function testDestroyBeforeConnect() {
  return new Promise((resolve) => {
    const server = h2.createServer();
    server.on('stream', common.mustNotCall());

    server.once('listening', common.mustCall(() => {
      const client = h2.connect(`http://localhost:${server.address().port}`);

      server.on('connection', common.mustCall(() => {
        server.close();
        client.close();
        httpClientAbortCount++;
        resolve();
      }));

      const req = client.request();
      req.destroy();
    }));
    server.listen(0);
  });
}

function testDestroyWithAbortSignal() {
  return new Promise((resolve) => {
    const server = h2.createServer();
    const controller = new AbortController();

    server.on('stream', common.mustNotCall());
    server.once('listening', common.mustCall(() => {
      const client = h2.connect(`http://localhost:${server.address().port}`);
      client.on('close', common.mustCall());

      const { signal } = controller;
      assert.strictEqual(getEventListeners(signal, 'abort').length, 0);

      client.on('error', common.mustCall(() => {
        // After underlying stream dies, signal listener detached
        assert.strictEqual(getEventListeners(signal, 'abort').length, 0);
      }));

      const req = client.request({}, { signal });

      req.on('error', common.mustCall((err) => {
        assert.strictEqual(err.code, 'ABORT_ERR');
        assert.strictEqual(err.name, 'AbortError');
      }));
      req.on('close', common.mustCall(() => {
        server.close();
        httpClientAbortCount++;
        resolve();
      }));

      assert.strictEqual(req.aborted, false);
      assert.strictEqual(req.destroyed, false);
      // Signal listener attached
      assert.strictEqual(getEventListeners(signal, 'abort').length, 1);

      controller.abort();

      assert.strictEqual(req.aborted, false);
      assert.strictEqual(req.destroyed, true);
    }));
    server.listen(0);
  });
}

function testAbortImmediatelyWithDestroyedSignal() {
  return new Promise((resolve) => {
    const server = h2.createServer();
    const controller = new AbortController();

    server.on('stream', common.mustNotCall());
    server.once('listening', common.mustCall(() => {
      const client = h2.connect(`http://localhost:${server.address().port}`);
      client.on('close', common.mustCall());

      const { signal } = controller;
      controller.abort();

      assert.strictEqual(getEventListeners(signal, 'abort').length, 0);

      client.on('error', common.mustCall(() => {
        // After underlying stream dies, signal listener detached
        assert.strictEqual(getEventListeners(signal, 'abort').length, 0);
      }));

      const req = client.request({}, { signal });
      // Signal already aborted, so no event listener attached.
      assert.strictEqual(getEventListeners(signal, 'abort').length, 0);

      assert.strictEqual(req.aborted, false);
      // Destroyed on same tick as request made
      assert.strictEqual(req.destroyed, true);

      req.on('error', common.mustCall((err) => {
        assert.strictEqual(err.code, 'ABORT_ERR');
        assert.strictEqual(err.name, 'AbortError');
      }));
      req.on('close', common.mustCall(() => {
        server.close();
        httpClientAbortCount++;
        resolve();
      }));
    }));
    server.listen(0);
  });
}

async function testDestroyClientHttpSessionWithAbortSignal() {
  async function testH2ConnectAbort(secure) {
    return new Promise((resolve) => {
      const server = secure ? h2.createSecureServer() : h2.createServer();
      const controller = new AbortController();
      server.on('stream', common.mustNotCall());
      server.once('listening', common.mustCall(() => {
        const { signal } = controller;
        const protocol = secure ? 'https' : 'http';
        const client = h2.connect(`${protocol}://localhost:${server.address().port}`, {
          signal,
        });
        client.on('close', common.mustCall());
        assert.strictEqual(getEventListeners(signal, 'abort').length, 1);
        client.on('error', common.mustCall((err) => {
          assert.strictEqual(err.code, 'ABORT_ERR');
          assert.strictEqual(err.name, 'AbortError');
        }));
        const req = client.request({}, {});
        assert.strictEqual(getEventListeners(signal, 'abort').length, 1);
        req.on('error', common.mustCall((err) => {
          assert.strictEqual(err.code, 'ERR_HTTP2_STREAM_CANCEL');
          assert.strictEqual(err.name, 'Error');
          assert.strictEqual(req.aborted, false);
          assert.strictEqual(req.destroyed, true);
        }));
        req.on('close', common.mustCall(() => {
          server.close();
          resolve();
        }));
        assert.strictEqual(req.aborted, false);
        assert.strictEqual(req.destroyed, false);
        // Signal listener attached
        assert.strictEqual(getEventListeners(signal, 'abort').length, 1);
        controller.abort();
      }));
      server.listen(0);
    });
  }
  await testH2ConnectAbort(false);
  httpClientAbortCount++;
  await testH2ConnectAbort(true);
  httpClientAbortCount++;
}

function testDestroyClientHttp2StreamWithAbortSignal() {
  return new Promise((resolve) => {
    const server = h2.createServer();
    const controller = new AbortController();

    server.on('stream', common.mustCall((stream) => {
      stream.on('error', common.mustNotCall());
      stream.on('close', common.mustCall(() => {
        assert.strictEqual(stream.rstCode, h2.constants.NGHTTP2_CANCEL);
        server.close();
        httpClientAbortCount++;
        httpServerAbortCount++;
        resolve();
      }));
      controller.abort();
    }));
    server.once('listening', common.mustCall(() => {
      const client = h2.connect(`http://localhost:${server.address().port}`);
      client.on('close', common.mustCall());

      const { signal } = controller;
      const req = client.request({}, { signal });
      assert.strictEqual(getEventListeners(signal, 'abort').length, 1);
      req.on('error', common.mustCall((err) => {
        assert.strictEqual(err.code, 'ABORT_ERR');
        assert.strictEqual(err.name, 'AbortError');
        client.close();
      }));
      req.on('close', common.mustCall());
    }));
    server.listen(0);
  });
}

tests.push({
  name: 'Test destroy before client operations',
  test: testDestroyBeforeClientOperations
});

tests.push({
  name: 'Test destroy before goaway',
  test: testDestroyBeforeGoaway
});

tests.push({
  name: 'Test destroy before connect',
  test: testDestroyBeforeConnect
});

tests.push({
  name: 'Destroy with AbortSignal',
  test: testDestroyWithAbortSignal
});

tests.push({
  name: 'Pass an already destroyed signal to abort immediately',
  test: testAbortImmediatelyWithDestroyedSignal
});

tests.push({
  name: 'Destroy ClientHttpSession with AbortSignal',
  test: testDestroyClientHttpSessionWithAbortSignal
});

tests.push({
  name: 'Destroy ClientHttp2Stream with AbortSignal',
  test: testDestroyClientHttp2StreamWithAbortSignal,
});

for (const { name, test } of tests) {
  console.log(`${name}`);
  await test();
}

assert.strictEqual(nsolid.traceStats.httpClientCount, 0);
assert.strictEqual(nsolid.traceStats.httpClientAbortCount, httpClientAbortCount);
assert.strictEqual(nsolid.traceStats.httpServerCount, 0);
assert.strictEqual(nsolid.traceStats.httpServerAbortCount, httpServerAbortCount);
