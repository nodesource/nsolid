// Flags: --dns-result-order=ipv4first
'use strict';

const common = require('../../common');
const assert = require('assert');
const http = require('http');
const { AsyncLocalStorage } = require('async_hooks');
const { setupNSolid } = require('./utils');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const fixtures = require('../../common/fixtures');
const binding = require(`./build/${common.buildType}/binding`);
const nsolid = require('nsolid');
const api = require(require.resolve('@opentelemetry/api',
                                    { paths: [fixtures.fixturesDir] }));

setupNSolid({ lookup: false }, common.mustCall(() => {
  assert.ok(nsolid.otel.register(api));
  const tracer = api.trace.getTracer('test');
  const als = new AsyncLocalStorage();
  const error = new Error('listener');
  const context = api.ROOT_CONTEXT.setValue('test', 'other');

  checkTracesOnExit(binding, [1, 2].map((id) => ({
    name: `parent ${id}`,
    children: [
      { name: 'HTTP GET', children: [{ name: 'HTTP GET' }] },
      { name: `child ${id}` },
    ],
  })).concat({ name: 'HTTP GET' }));

  // An empty OTel store must still bind to ROOT_CONTEXT.
  const rootReq = http.request({ host: '127.0.0.1', port: 1 });
  rootReq.on('error', common.mustCall((err) => {
    assert.strictEqual(err, error);
    assert.strictEqual(api.context.active(), api.ROOT_CONTEXT);
  }));
  rootReq.on('close', common.mustCall(() => {
    assert.strictEqual(api.context.active(), api.ROOT_CONTEXT);
  }));
  api.context.with(context, () => rootReq.destroy(error));

  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const server = http.createServer(common.mustCall((req, res) => res.end(), 2));
  let socket;
  server.listen(0, '127.0.0.1', common.mustCall(() => request(1)));

  function request(id) {
    const parent = tracer.startSpan(`parent ${id}`, { root: true });
    const ctx = api.trace.setSpan(api.ROOT_CONTEXT, parent);
    const callback = common.mustCall(onResponse);
    const req = als.run('A', () => api.context.with(ctx, () => http.request({
      host: '127.0.0.1', port: server.address().port, agent,
    }, callback)));

    function check() {
      assert.strictEqual(api.context.active(), ctx);
      assert.strictEqual(this, req);
    }

    function onResponse(res) {
      check.call(this);
      const child = tracer.startSpan(`child ${id}`);
      assert.strictEqual(child.spanContext().traceId, parent.spanContext().traceId);
      child.end();
      res.resume();
    }

    assert.ok(req.listeners('response').includes(callback));
    req.off('response', callback);
    assert.strictEqual(req.listeners('response').length, 0);
    req.once('response', callback);
    assert.strictEqual(req.rawListeners('response')[0].listener, callback);
    const removed = common.mustNotCall();
    req.on('response', removed);
    req.off('response', removed);
    assert.ok(!req.listeners('response').includes(removed));
    req.on('socket', common.mustCall(function(s) {
      check.call(this);
      if (id === 1) socket = s;
      else assert.strictEqual(s, socket);
    }));
    req.on('finish', common.mustCall(check));
    req.on('error', common.mustCall(function(err) {
      check.call(this);
      assert.strictEqual(err, error);
    }));
    req.on('close', common.mustCall(function() {
      check.call(this);
      parent.end();
      if (id === 1) {
        // Keep the socket's original async context while creating request two.
        request(2);
      } else {
        agent.destroy();
        server.close();
      }
    }));

    const emitContext = api.ROOT_CONTEXT.setValue('test', 'emit');
    req.on('context', common.mustCall(function(value) {
      check.call(this);
      assert.strictEqual(value, 42);
      assert.strictEqual(als.getStore(), 'B');
    }));
    als.run('B', common.mustCall(() => api.context.with(
      emitContext, common.mustCall(() => {
        assert.strictEqual(req.emit('context', 42), true);
        req.emit('error', error);
        assert.strictEqual(api.context.active(), emitContext);
        req.on('throw', common.mustCall(() => { throw error; }));
        assert.throws(common.mustCall(() => req.emit('throw')),
                      (err) => err === error);
        assert.strictEqual(api.context.active(), emitContext);
        assert.strictEqual(als.getStore(), 'B');
      }))));

    const userContext = ctx.setValue('test', 'rebound');
    api.context.bind(userContext, req);
    req.on('rebound', common.mustCall(() => {
      assert.strictEqual(api.context.active(), userContext);
    }));
    req.emit('rebound');
    // Existing listeners keep the constructor's context after explicit binding.
    req.end();
  }
}));
