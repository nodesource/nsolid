// Flags: --expose-internals
'use strict';

// Snapshot settings apply to heap profiles, which end in a heap snapshot.
// Redaction covers the property names of dictionary-mode objects, RegExp
// sources and WeakMap pairs' names, and once snapshots are redacted or disabled
// they stay that way.

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const { internalBinding } = require('internal/test/binding');

const { UV_EPERM } = internalBinding('uv');

// Data used as property names, in a store like express-session's MemoryStore.
// Objects without a prototype are dictionaries.
const tag = `${process.hrtime.bigint()}${Math.random().toString(36).slice(2)}`;
const sessionId = `session-${tag}`;
const reSource = `secret-${tag}`;
// Flat, as from JSON.parse(): V8 names a concatenated string
// "(concatenated string)" rather than by its contents.
const weakValue = JSON.parse(`"weak-${tag}"`);
const sessions = { __proto__: null };
sessions[sessionId] = { user: 'alice' };
const pattern = new RegExp(reSource);
// A WeakMap pair's edges are named after its key and value.
const weakKey = {};
const weak = new WeakMap([[weakKey, weakValue]]);

async function heapProfile() {
  const stream = nsolid.heapProfileStream(0, 100, false);
  stream.setEncoding('utf8');
  let data = '';
  for await (const chunk of stream) {
    data += chunk;
  }
  return JSON.parse(data).strings;
}

function hasSecrets(strings) {
  return strings.some((s) => s.includes(sessionId) || s.includes(reSource) ||
                             s.includes(weakValue));
}

function heapProfileFails() {
  return new Promise((resolve) => {
    const stream = nsolid.heapProfileStream(0, 100, false);
    stream.on('error', common.mustCall((err) => {
      assert.strictEqual(err.code, UV_EPERM);
      resolve();
    }));
    stream.resume();
  });
}

(async () => {
  // Without redaction the secrets are in the snapshot, the WeakMap one in its
  // pair's edge name too, so the checks below can't pass by accident.
  let strings = await heapProfile();
  assert(strings.includes(sessionId));
  assert(strings.some((s) => s.includes(reSource)));
  assert(strings.some((s) => s.includes('pair in WeakMap') &&
                             s.includes(weakValue)));

  nsolid.start({ redactSnapshots: true });
  strings = await heapProfile();
  assert(!hasSecrets(strings));
  assert(strings.includes('(redacted)'));

  nsolid.start({ redactSnapshots: false });
  assert.strictEqual(nsolid.config.redactSnapshots, true);
  strings = await heapProfile();
  assert(!hasSecrets(strings));

  nsolid.start({ disableSnapshots: true });
  await heapProfileFails();

  nsolid.start({ disableSnapshots: false });
  assert.strictEqual(nsolid.config.disableSnapshots, true);
  await heapProfileFails();

  // The objects stayed alive for every snapshot above.
  assert.strictEqual(sessions[sessionId].user, 'alice');
  assert(pattern.test(reSource));
  assert.strictEqual(weak.get(weakKey), weakValue);
})().then(common.mustCall());
