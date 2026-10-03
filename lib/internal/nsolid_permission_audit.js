'use strict';

// Forwards the permission model audit messages (--permission-audit or
// NSOLID_PERMISSION_AUDIT) to the N|Solid agents. Each unique
// (permission, resource) pair is reported once per thread, up to
// kMaxAuditEntries pairs.

const {
  ArrayPrototypeForEach,
  SafeSet,
} = primordials;

const {
  pushPermissionAudit,
  pushPermissionAuditLimit,
} = internalBinding('nsolid_api');

const dc = require('diagnostics_channel');

const kMaxAuditEntries = 1000;

const kChannels = [
  'node:permission-model:fs',
  'node:permission-model:child',
  'node:permission-model:worker',
  'node:permission-model:inspector',
  'node:permission-model:wasi',
  'node:permission-model:addon',
  'node:permission-model:openssl-store',
];

const seen = new SafeSet();
let limitReached = false;

function onMessage(message) {
  // Drops aren't access violations.
  if (limitReached || message.drop === true)
    return;

  const permission = `${message.permission}`;
  const resource = message.resource == null ? '' : `${message.resource}`;
  const key = `${permission}\0${resource}`;
  if (seen.has(key))
    return;

  if (seen.size >= kMaxAuditEntries) {
    limitReached = true;
    seen.clear();
    pushPermissionAuditLimit(kMaxAuditEntries);
    return;
  }

  seen.add(key);
  pushPermissionAudit(permission, resource);
}

function init() {
  ArrayPrototypeForEach(kChannels, (name) => dc.subscribe(name, onMessage));
}

module.exports = {
  init,
  kMaxAuditEntries,
};
