// Flags: --expose-internals --no-warnings
'use strict';

const common = require('../../common');
const assert = require('assert');

if (process.argv[2] === 'child') {
  const { internalBinding } = require('internal/test/binding');
  const { now } = require('internal/perf/utils');
  const binding = internalBinding('nsolid_api');
  const addon = require(`./build/${common.buildType}/binding`);
  const { setupNSolid } = require('./utils');
  const c = binding.nsolid_consts;
  addon.skipExpectedTracesCheck();
  setupNSolid({ lookup: false }, common.mustCall(() => {
    const monotonic = now();
    const timestamp = Date.now() - 3600000;
    // Simulate a span anchored an hour behind the current wall clock.
    for (const id of [1, 2]) {
      if (id === 1) {
        binding.pushSpanDataDouble(0, id, c.kSpanStart,
                                   timestamp, monotonic);
      } else {
        binding.pushSpanDataDouble(0, id, c.kSpanStart, timestamp);
      }
      binding.pushSpanDataUint64(0, id, c.kSpanType, c.kSpanCustom);
      binding.pushSpanDataString(0, id, c.kSpanName, `clock-${id}`);
      binding.pushSpanDataString(0, id, c.kSpanTraceId, '1'.repeat(32));
      binding.pushSpanDataString(0, id, c.kSpanSpanId,
                                 id.toString().padStart(16, '0'));
    }
    // Allow the property queue to drain before shutdown ends the spans.
    setTimeout(common.mustCall(), 200);
  }));
} else {
  const { spawnSync } = require('child_process');
  const child = spawnSync(process.execPath,
                          ['--expose-internals', '--no-warnings', __filename, 'child'],
                          { encoding: 'utf8' });
  assert.strictEqual(child.status, 0, child.stderr);
  const spans = [...child.stderr.matchAll(/got_trace: (\{[\s\S]*?\n\})/g)]
    .map((match) => JSON.parse(match[1]));
  assert.strictEqual(spans.length, 2, child.stderr);
  const monotonic = spans.find((span) => span.name === 'clock-1');
  const explicit = spans.find((span) => span.name === 'clock-2');
  assert.ok(monotonic.end >= monotonic.start);
  assert.ok(monotonic.end - monotonic.start < 60000);
  assert.ok(explicit.end - explicit.start >= 3600000);
}
