// Flags: --expose-internals
'use strict';

require('../common');
const assert = require('node:assert');
const createAgent = require('internal/agents/statsd/lib/agent');
const sent = [];
const agent = createAgent({
  bucket: () => 'bucket',
  tags: () => '',
  status: () => 'ready',
  udpIp: () => '127.0.0.1:8125',
  send: (lines) => sent.push(...lines),
});
for (const [method, type] of [['counter', 'c'], ['gauge', 'g'],
                              ['set', 's'], ['timing', 'ms']]) {
  const name = 'name\r\n|:#,injected';
  for (const value of [0, -1, 1.5, Number.MAX_VALUE, '1', '+5', '-5',
                       '.5', '1.', '1e3', '-1.2E-3']) {
    const expected = `bucket.name------injected:${value}|${type}`;
    assert.strictEqual(agent.format[method](name, value), expected);
    agent[method](name, value);
    assert.strictEqual(sent.pop(), expected);
  }
  const invalid = [
    [undefined, 'ERR_INVALID_ARG_TYPE'],
    [null, 'ERR_INVALID_ARG_TYPE'],
    [true, 'ERR_INVALID_ARG_TYPE'],
    [{}, 'ERR_INVALID_ARG_TYPE'],
    [1n, 'ERR_INVALID_ARG_TYPE'],
    [NaN, 'ERR_OUT_OF_RANGE'],
    [Infinity, 'ERR_OUT_OF_RANGE'],
    [-Infinity, 'ERR_OUT_OF_RANGE'],
  ];
  if (method !== 'set') {
    for (const value of ['', ' ', ' 1', '1 ', '1\n', '1\r\n', 'NaN',
                         'Infinity', '0x10', '1_000', '1|c', '1:2', '1e',
                         'value\r\n|#tag,injected', '9'.repeat(10000) + 'x']) {
      invalid.push([value, 'ERR_INVALID_ARG_VALUE']);
    }
    invalid.push(['1e309', 'ERR_OUT_OF_RANGE']);
  }
  for (const [value, code] of invalid) {
    assert.throws(() => agent.format[method]('name', value), { code });
    assert.throws(() => agent[method]('name', value), { code });
    assert.deepStrictEqual(sent, []);
  }
}
for (const [value, cleaned] of [
  ['user-id', 'user-id'],
  ['value\r\n|#tag,injected:1', 'value----tag-injected-1'],
  ['', ''],
  ['1e309', '1e309'],
]) {
  const expected = `bucket.users:${cleaned}|s`;
  assert.strictEqual(agent.format.set('users', value), expected);
  agent.set('users', value);
  assert.strictEqual(sent.pop(), expected);
}
