// Flags: --expose-internals
'use strict';

// Snapshot settings apply to heap profiles, which end in a heap snapshot,
// including one that's already running. Redaction covers the property names
// of dictionary-mode objects, RegExp sources and WeakMap pairs' names. The
// settings can be enabled and disabled at runtime.

const common = require('../common');
const assert = require('assert');
const { isMainThread } = require('worker_threads');
if (!isMainThread)
  common.skip('This test only works on a main thread');

const { spawnSync } = require('child_process');
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

function heapProfileFails(duration = 100) {
  return new Promise((resolve) => {
    const stream = nsolid.heapProfileStream(0, duration, false);
    stream.on('error', common.mustCall((err) => {
      assert.strictEqual(err.code, UV_EPERM);
      resolve();
    }));
    stream.resume();
  });
}

// Settings that aren't booleans are read as booleans, which is what the agents
// and the runtime expect.
{
  const child = spawnSync(process.execPath, ['-e', `
    const nsolid = require('nsolid');
    nsolid.start({ disableSnapshots: 1, redactSnapshots: 'true' });
    const { disableSnapshots, redactSnapshots } = nsolid.config;
    console.log(JSON.stringify([disableSnapshots, redactSnapshots]));
  `], { encoding: 'utf8' });
  assert.strictEqual(child.status, 0, child.stderr);
  assert.deepStrictEqual(JSON.parse(child.stdout), [true, true]);
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
  const redactedProfile = heapProfile();
  nsolid.start({ redactSnapshots: false });
  assert.strictEqual(nsolid.config.redactSnapshots, false);
  // A profile admitted with redaction stays redacted after reconfiguration.
  strings = await redactedProfile;
  assert(!hasSecrets(strings));
  assert(strings.includes('(redacted)'));

  strings = await heapProfile();
  assert(hasSecrets(strings));

  // Disabling snapshots also ends a heap profile that's running, without
  // taking its snapshot.
  const running = heapProfileFails(1000);
  nsolid.start({ disableSnapshots: true });
  await running;
  await heapProfileFails();

  nsolid.start({ disableSnapshots: false });
  assert.strictEqual(nsolid.config.disableSnapshots, false);
  strings = await heapProfile();
  assert(hasSecrets(strings));

  // The objects stayed alive for every snapshot above.
  assert.strictEqual(sessions[sessionId].user, 'alice');
  assert(pattern.test(reSource));
  assert.strictEqual(weak.get(weakKey), weakValue);
})().then(common.mustCall());
