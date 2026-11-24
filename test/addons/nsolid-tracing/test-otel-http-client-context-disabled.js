// Flags: --expose-internals
'use strict';

const common = require('../../common');
const assert = require('assert');
const http = require('http');
const { contextManager } = require('internal/otel/context');
const { ROOT_CONTEXT } = require('internal/otel/api');
const { generateSpan } = require('internal/nsolid_trace');
const { internalBinding } = require('internal/test/binding');
const { kSpanHttpClient } = internalBinding('nsolid_api').nsolid_consts;

assert.ok(!generateSpan(kSpanHttpClient));
const context = ROOT_CONTEXT.setValue('test', 'emit');
const error = new Error('destroy');
const req = http.request({ host: '127.0.0.1', port: 1 });
req.on('context', common.mustCall(function(value) {
  assert.strictEqual(this, req);
  assert.strictEqual(value, 42);
  assert.strictEqual(contextManager.active(), context);
}));
contextManager.with(context, common.mustCall(() => {
  assert.strictEqual(req.emit('context', 42), true);
  assert.strictEqual(req.emit('missing'), false);
}));
req.on('error', common.mustCall((err) => assert.strictEqual(err, error)));
req.on('close', common.mustCall());
req.destroy(error);
