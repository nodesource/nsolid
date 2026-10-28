// Flags: --expose-internals --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const assert = require('assert');
const { internalBinding } = require('internal/test/binding');
const cares = internalBinding('cares_wrap');
const { UV_EPERM } = internalBinding('uv');
const dnsPromises = require('dns').promises;
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const expectedTraces = [
  {
    attributes: {
      'dns.hostname': 'example.org',
      'dns.op_type': binding.kDnsResolve,
    },
    end_reason: binding.kSpanEndError,
    name: 'DNS resolve',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
];

checkTracesOnExit(binding, expectedTraces);

// Stub cares to force an error so we can test DNS error code path.
cares.ChannelWrap.prototype.queryA = () => UV_EPERM;

setupNSolid(common.mustCall(async () => {
  await assert.rejects(
    dnsPromises.resolve('example.org'),
    {
      code: 'EPERM',
      syscall: 'queryA',
      hostname: 'example.org',
    },
  );
}));
