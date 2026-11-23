'use strict';

const common = require('../common');
const assert = require('node:assert');
const dgram = require('node:dgram');
const nsolid = require('nsolid');

const app = 'bucket\r\n|:#,' + 'b'.repeat(243) + '😀tail';
const env = 'env\r\n|';
const operatorTags = Array.from({ length: 20 }, (_, i) =>
  `${String(i).padStart(2, '0')}:${'t'.repeat(137)}`);
operatorTags[0] = '00:tag\r\n|' + 't'.repeat(131);
const threadName = 'thread\r\n|:#,' + 'w'.repeat(243) + '😀tail';
const bucket = `bucket------${'b'.repeat(243)}😀tail.${nsolid.id.slice(0, 7)}`;
const tags = `|#key:env---,00:tag---${'t'.repeat(131)},${operatorTags.slice(1).join(',')}`;
const thread = 'thread------' + 'w'.repeat(243) + '😀tail';
const server = dgram.createSocket('udp4');
let done = false;
server.on('message', common.mustCallAtLeast((data) => {
  if (done) return;
  for (const line of data.toString().trimEnd().split('\n')) {
    const [metric, suffix] = line.split('|g');
    assert.ok(metric.startsWith(`${bucket}.`));
    if (suffix === tags) continue;
    assert.strictEqual(suffix, `${tags},threadId:0,threadName:${thread}`);
    done = true;
  }
  if (done) {
    assert.strictEqual(nsolid.statsd.format.bucket(), bucket);
    assert.strictEqual(nsolid.statsd.format.tags(), tags);
    nsolid.start({ statsd: null });
    server.close();
  }
}));
server.on('error', common.mustNotCall());
server.bind(0, '127.0.0.1', common.mustCall(() => {
  nsolid.setThreadName(threadName);
  nsolid.start({
    statsd: `udp://127.0.0.1:${server.address().port}`,
    interval: 100,
    app,
    env,
    tags: operatorTags,
    // eslint-disable-next-line no-template-curly-in-string
    statsdBucket: '${app}.${shortId}',
    // eslint-disable-next-line no-template-curly-in-string
    statsdTags: 'key:${env},${tags}',
  });
}));
process.on('exit', () => assert.ok(done, 'No sanitized thread metrics received'));
