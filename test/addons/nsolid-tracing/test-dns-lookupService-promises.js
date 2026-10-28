// Flags: --dns-result-order=ipv4first
'use strict';

const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const assert = require('assert');
const dnsPromises = require('dns').promises;
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const expectedTraces = [
  {
    attributes: {
      'dns.address': '127.0.0.1',
      'dns.op_type': binding.kDnsLookupService,
      'dns.port': 22,
    },
    end_reason: binding.kSpanEndOk,
    name: 'DNS lookup_service',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
  {
    attributes: {
      'dns.address': '192.0.2.1',
      'dns.op_type': binding.kDnsLookupService,
      'dns.port': 22,
    },
    end_reason: binding.kSpanEndError,
    name: 'DNS lookup_service',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
];

checkTracesOnExit(binding, expectedTraces);

setupNSolid(common.mustCall(async () => {
  dnsPromises.lookupService('127.0.0.1', 22).then(common.mustCall((result) => {
    assert.strictEqual(result.service, 'ssh');
    assert.strictEqual(typeof result.hostname, 'string');
    assert.notStrictEqual(result.hostname.length, 0);
  }));

  // Use an IP from the RFC 5737 test range to cause an error.
  // Refs: https://tools.ietf.org/html/rfc5737
  await assert.rejects(
    () => dnsPromises.lookupService('192.0.2.1', 22),
    { code: /^(?:ENOTFOUND|EAI_AGAIN)$/ },
  );
}));
