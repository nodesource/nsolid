// Flags: --expose-internals

'use strict';

require('../common');
const assert = require('node:assert');
const os = require('node:os');
const { describe, it } = require('node:test');
const nsolid = require('nsolid');

function waitForStatus(status, done) {
  const interval = setInterval(() => {
    if (nsolid.statsd.status() === status) {
      clearInterval(interval);
      done();
    }
  }, 10);
}

describe('format', () => {
  it('should return the correct format values', (t, done) => {
    assert.strictEqual(nsolid.statsd.status(), 'unconfigured');
    nsolid.start({
      statsd: 8125,
      app: 'hello.goodbye.hello'
    });
    waitForStatus('ready', () => {
      const info = nsolid.info();
      const env = info.nodeEnv.replace(/\./g, '-');
      const app = info.app.replace(/\./g, '-');
      const hostname = os.hostname().replace(/\./g, '-');
      const expectedBucket = `nsolid.${env}.${app}.${hostname}.${nsolid.id.substr(0, 7)}`;
      console.log(expectedBucket);
      assert.strictEqual(nsolid.statsd.format.bucket(), expectedBucket);
      assert.strictEqual(nsolid.statsd.format.tags(), '');
      assert.strictEqual(nsolid.statsd.format.counter('name', 'val'), `${expectedBucket}.name:val|c`);
      assert.strictEqual(nsolid.statsd.format.gauge('name', 'val'), `${expectedBucket}.name:val|g`);
      assert.strictEqual(nsolid.statsd.format.set('name', 'val'), `${expectedBucket}.name:val|s`);
      assert.strictEqual(nsolid.statsd.format.timing('name', 'val'), `${expectedBucket}.name:val|ms`);
      nsolid.start({
        statsdTags: 'tag1,tag2'
      });
      waitForStatus('ready', () => {
        assert.strictEqual(nsolid.statsd.format.bucket(), expectedBucket);
        assert.strictEqual(nsolid.statsd.format.tags(), '|#tag1,tag2');
        assert.strictEqual(nsolid.statsd.format.counter('name', 'val'), `${expectedBucket}.name:val|c|#tag1,tag2`);
        assert.strictEqual(nsolid.statsd.format.gauge('name', 'val'), `${expectedBucket}.name:val|g|#tag1,tag2`);
        assert.strictEqual(nsolid.statsd.format.set('name', 'val'), `${expectedBucket}.name:val|s|#tag1,tag2`);
        assert.strictEqual(nsolid.statsd.format.timing('name', 'val'), `${expectedBucket}.name:val|ms|#tag1,tag2`);
        done();
      });
    });
  });
});
