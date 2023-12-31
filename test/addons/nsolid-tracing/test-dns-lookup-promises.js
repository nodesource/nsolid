// Flags: --expose-internals --dns-result-order=ipv4first
'use strict';
const common = require('../../common');
const { checkTracesOnExit } = require('../../common/nsolid-traces');
const { setupNSolid } = require('./utils');
const assert = require('assert');
const { internalBinding } = require('internal/test/binding');
const cares = internalBinding('cares_wrap');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const expectedTraces = [
  {
    attributes: {
      'dns.address': '::1',
      'dns.hostname': 'example.com',
      'dns.op_type': binding.kDnsLookup,
    },
    end_reason: binding.kSpanEndOk,
    name: 'DNS lookup',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
  {
    attributes: {
      'dns.address': '127.0.0.1',
      'dns.hostname': 'example.com',
      'dns.op_type': binding.kDnsLookup,
    },
    end_reason: binding.kSpanEndOk,
    name: 'DNS lookup',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
  {
    attributes: {
      'dns.address': '127.0.0.1',
      'dns.hostname': 'example.com',
      'dns.op_type': binding.kDnsLookup,
    },
    end_reason: binding.kSpanEndOk,
    name: 'DNS lookup',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
  {
    attributes: {
      'dns.address': 'some-address',
      'dns.hostname': 'example.com',
      'dns.op_type': binding.kDnsLookup,
    },
    end_reason: binding.kSpanEndOk,
    name: 'DNS lookup',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
  {
    attributes: {
      'dns.address': 'some-address2',
      'dns.hostname': 'example.com',
      'dns.op_type': binding.kDnsLookup,
    },
    end_reason: binding.kSpanEndOk,
    name: 'DNS lookup',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
  {
    attributes: {
      'dns.hostname': 'example.com',
      'dns.op_type': binding.kDnsLookup,
    },
    end_reason: binding.kSpanEndError,
    name: 'DNS lookup',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
  {
    attributes: {
      'dns.address': [{ address: '::1', family: 6 },
                      { address: '::2', family: 6 }],
      'dns.hostname': 'example',
      'dns.op_type': binding.kDnsLookup,
    },
    end_reason: binding.kSpanEndOk,
    name: 'DNS lookup',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
  {
    attributes: {
      'dns.address': [{ address: '::1', family: 4 },
                      { address: '::2', family: 4 }],
      'dns.hostname': 'example',
      'dns.op_type': binding.kDnsLookup,
    },
    end_reason: binding.kSpanEndOk,
    name: 'DNS lookup',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
  {
    attributes: {
      'dns.address': [{ address: '127.0.0.1', family: 4 },
                      { address: 'some-address', family: 0 }],
      'dns.hostname': 'example',
      'dns.op_type': binding.kDnsLookup,
    },
    end_reason: binding.kSpanEndOk,
    name: 'DNS lookup',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
  {
    attributes: {
      'dns.address': [{ address: '127.0.0.1', family: 6 },
                      { address: 'some-address', family: 6 }],
      'dns.hostname': 'example',
      'dns.op_type': binding.kDnsLookup,
    },
    end_reason: binding.kSpanEndOk,
    name: 'DNS lookup',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
  {
    attributes: {
      'dns.address': [],
      'dns.hostname': 'example',
      'dns.op_type': binding.kDnsLookup,
    },
    end_reason: binding.kSpanEndOk,
    name: 'DNS lookup',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
  {
    attributes: {
      'dns.hostname': 'example.com',
      'dns.op_type': binding.kDnsLookup,
    },
    end_reason: binding.kSpanEndError,
    name: 'DNS lookup',
    parentId: '0000000000000000',
    thread_id: 0,
    kind: binding.kClient,
    type: binding.kSpanDNS,
  },
];

checkTracesOnExit(binding, expectedTraces);

// Stub `getaddrinfo` to proxy its call dynamic stub. This has to be done before
// we load the `dns` module to guarantee that the `dns` module uses the stub.
let getaddrinfoStub = null;
cares.getaddrinfo = (req) => getaddrinfoStub(req);

const dnsPromises = require('dns').promises;

function getaddrinfoNegative() {
  return function getaddrinfoNegativeHandler(req) {
    const originalReject = req.reject;
    req.resolve = common.mustNotCall();
    req.reject = common.mustCall(originalReject);
    req.oncomplete(internalBinding('uv').UV_ENOMEM);
  };
}

function getaddrinfoPositive(addresses) {
  return function getaddrinfo_positive(req) {
    const originalResolve = req.resolve;
    req.reject = common.mustNotCall();
    req.resolve = common.mustCall(originalResolve);
    req.oncomplete(null, addresses);
  };
}

async function lookupPositive() {
  [
    {
      stub: getaddrinfoPositive(['::1']),
      factory: () => dnsPromises.lookup('example.com'),
      expectation: { address: '::1', family: 6 },
    },
    {
      stub: getaddrinfoPositive(['127.0.0.1']),
      factory: () => dnsPromises.lookup('example.com'),
      expectation: { address: '127.0.0.1', family: 4 },
    },
    {
      stub: getaddrinfoPositive(['127.0.0.1'], { family: 4 }),
      factory: () => dnsPromises.lookup('example.com'),
      expectation: { address: '127.0.0.1', family: 4 },
    },
    {
      stub: getaddrinfoPositive(['some-address']),
      factory: () => dnsPromises.lookup('example.com'),
      expectation: { address: 'some-address', family: 0 },
    },
    {
      stub: getaddrinfoPositive(['some-address2']),
      factory: () => dnsPromises.lookup('example.com', { family: 6 }),
      expectation: { address: 'some-address2', family: 6 },
    },
  ].forEach(async ({ stub, factory, expectation }) => {
    getaddrinfoStub = stub;
    assert.deepStrictEqual(await factory(), expectation);
  });
}

async function lookupNegative() {
  getaddrinfoStub = getaddrinfoNegative();
  const expected = {
    code: 'ENOMEM',
    hostname: 'example.com',
    syscall: 'getaddrinfo',
  };
  return assert.rejects(dnsPromises.lookup('example.com'), expected);
}

async function lookupallPositive() {
  [
    {
      stub: getaddrinfoPositive(['::1', '::2']),
      factory: () => dnsPromises.lookup('example', { all: true }),
      expectation: [
        { address: '::1', family: 6 },
        { address: '::2', family: 6 },
      ],
    },
    {
      stub: getaddrinfoPositive(['::1', '::2']),
      factory: () => dnsPromises.lookup('example', { all: true, family: 4 }),
      expectation: [
        { address: '::1', family: 4 },
        { address: '::2', family: 4 },
      ],
    },
    {
      stub: getaddrinfoPositive(['127.0.0.1', 'some-address']),
      factory: () => dnsPromises.lookup('example', { all: true }),
      expectation: [
        { address: '127.0.0.1', family: 4 },
        { address: 'some-address', family: 0 },
      ],
    },
    {
      stub: getaddrinfoPositive(['127.0.0.1', 'some-address']),
      factory: () => dnsPromises.lookup('example', { all: true, family: 6 }),
      expectation: [
        { address: '127.0.0.1', family: 6 },
        { address: 'some-address', family: 6 },
      ],
    },
    {
      stub: getaddrinfoPositive([]),
      factory: () => dnsPromises.lookup('example', { all: true }),
      expectation: [],
    },
  ].forEach(async ({ stub, factory, expectation }) => {
    getaddrinfoStub = stub;
    assert.deepStrictEqual(await factory(), expectation);
  });
}

async function lookupallNegative() {
  getaddrinfoStub = getaddrinfoNegative();
  const expected = {
    code: 'ENOMEM',
    hostname: 'example.com',
    syscall: 'getaddrinfo',
  };
  return assert.rejects(dnsPromises.lookup('example.com', { all: true }),
                        expected);
}

setupNSolid({ lookup: false }, common.mustCall(() => {
  (async () => {
    await Promise.all([
      lookupPositive(),
      lookupNegative(),
      lookupallPositive(),
      lookupallNegative(),
    ]);
  })().then(common.mustCall());
}));
