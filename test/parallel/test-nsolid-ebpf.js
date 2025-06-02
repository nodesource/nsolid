'use strict';

require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

const ebpfSupport = nsolid.detectEBPFSupport();

assert.strictEqual(typeof ebpfSupport, 'object');

const expectedProperties = [
  'isSupported',
  'bpfJitEnabled',
  'hasRootAccess',
  'hasBPFCapability',
  'hasSysAdminCapability',
  'supportsPerfEvents',
  'supportsKprobes',
  'supportsUprobes',
  'supportsTracepoints',
];

for (const prop of expectedProperties) {
  assert(prop in ebpfSupport, `eBPF support info should have ${prop} property`);
}

assert.strictEqual(typeof ebpfSupport.isSupported, 'boolean');
assert.strictEqual(typeof ebpfSupport.bpfJitEnabled, 'boolean');
assert.strictEqual(typeof ebpfSupport.hasRootAccess, 'boolean');
assert.strictEqual(typeof ebpfSupport.hasBPFCapability, 'boolean');
assert.strictEqual(typeof ebpfSupport.hasSysAdminCapability, 'boolean');
assert.strictEqual(typeof ebpfSupport.supportsPerfEvents, 'boolean');
assert.strictEqual(typeof ebpfSupport.supportsKprobes, 'boolean');
assert.strictEqual(typeof ebpfSupport.supportsUprobes, 'boolean');
assert.strictEqual(typeof ebpfSupport.supportsTracepoints, 'boolean');
