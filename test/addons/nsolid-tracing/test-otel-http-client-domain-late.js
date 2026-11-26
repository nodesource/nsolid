// Flags: --expose-internals
'use strict';

const common = require('../../common');
const assert = require('assert');
const { internalBinding } = require('internal/test/binding');
// Loading domain patches emit after the HTTP prototypes are initialized.
const http = require('http');
const domain = require('domain');

const binding = internalBinding('nsolid_api');
binding.trace_flags[0] = binding.nsolid_consts.kSpanHttpClient;

const d = domain.create();
const error = new Error('request failed');
let req;
d.on('error', common.mustCall((err) => {
  assert.strictEqual(err, error);
  assert.strictEqual(err.domainEmitter, req);
  assert.strictEqual(err.domain, d);
}));
d.run(common.mustCall(() => {
  req = http.request({ host: '127.0.0.1', port: 1, agent: false });
  // Traced requests get their own emit, which must still reach domain's.
  assert.ok(Object.hasOwn(req, 'emit'));
  req.destroy(error);
}));
