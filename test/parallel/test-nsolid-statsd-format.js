'use strict';

require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

function getExpectedBucket() {
  const config = nsolid.config;
  let bucket = config.statsdBucket;
  bucket = bucket.replace(/\${env}/ig, config.env.replace(/\./g, '-'));
  bucket = bucket.replace(/\${app}/ig, config.app.replace(/\./g, '-'));
  bucket = bucket.replace(/\${hostname}/ig,
                          config.hostname.replace(/\./g, '-'));
  bucket = bucket.replace(/\${id}/ig, nsolid.id);
  bucket = bucket.replace(/\${shortId}/ig, nsolid.id.substr(0, 7));
  return bucket;
}

const port = 9999;
nsolid.start({
  statsd: port
});

assert.strictEqual(nsolid.config.statsd, `localhost:${port}`);

let expectedBucket = getExpectedBucket();

while (nsolid.statsd.format.bucket() !== expectedBucket);

assert.strictEqual(nsolid.statsd.format.counter('name', 'value'),
                   `${expectedBucket}.name:value|c`);
assert.strictEqual(nsolid.statsd.format.gauge('name', 'value'),
                   `${expectedBucket}.name:value|g`);
assert.strictEqual(nsolid.statsd.format.set('name', 'value'),
                   `${expectedBucket}.name:value|s`);
assert.strictEqual(nsolid.statsd.format.timing('name', 'value'),
                   `${expectedBucket}.name:value|ms`);

nsolid.start({
  /* eslint-disable no-template-curly-in-string */
  statsdBucket: 'nsolid.${env}.${app}.${hostname}.${id}',
  statsdTags: 'st1,st2,${tags}',
  tags: ['t1,t2']
});

expectedBucket = getExpectedBucket();

while (nsolid.statsd.format.bucket() !== expectedBucket ||
       nsolid.statsd.format.tags().length === 0);

assert.strictEqual(nsolid.statsd.format.counter('name', 'value'),
                   `${expectedBucket}.name:value|c|#st1,st2,t1,t2`);
assert.strictEqual(nsolid.statsd.format.gauge('name', 'value'),
                   `${expectedBucket}.name:value|g|#st1,st2,t1,t2`);
assert.strictEqual(nsolid.statsd.format.set('name', 'value'),
                   `${expectedBucket}.name:value|s|#st1,st2,t1,t2`);
assert.strictEqual(nsolid.statsd.format.timing('name', 'value'),
                   `${expectedBucket}.name:value|ms|#st1,st2,t1,t2`);
