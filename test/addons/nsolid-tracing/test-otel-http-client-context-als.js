// Flags: --dns-result-order=ipv4first
'use strict';

const common = require('../../common');
const assert = require('assert');
const http = require('http');
const net = require('net');
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
  checkTracesOnExit(binding, [{ name: 'HTTP GET' }]);
  const context = api.ROOT_CONTEXT.setValue('test', 'creation');
  const otherContext = api.ROOT_CONTEXT.setValue('test', 'destroy');
  const als = new AsyncLocalStorage();
  const error = new Error('destroy');
  // A handle-free socket keeps destruction entirely in the caller's context.
  const req = als.run('A', () => api.context.with(context, () => http.request({
    host: '127.0.0.1', port: 1, createConnection: () => new net.Socket(),
  })));
  req.on('error', common.mustCall((err) => {
    assert.strictEqual(err, error);
    assert.strictEqual(api.context.active(), context);
    assert.strictEqual(als.getStore(), 'B');
  }));
  req.on('close', common.mustCall(() => {
    assert.strictEqual(api.context.active(), context);
    assert.strictEqual(als.getStore(), 'B');
  }));
  req.on('socket', common.mustCall(() => {
    assert.strictEqual(als.getStore(), 'A');
    als.run('B', () => api.context.with(otherContext, () => req.destroy(error)));
  }));
}));
