// Flags: --expose-internals
'use strict';
const common = require('../common');
const assert = require('node:assert');
const nsolid = require('nsolid');

async function waitForFormat(bucket, tags) {
  const deadline = Date.now() + common.platformTimeout(5000);
  while (nsolid.statsd.format.bucket() !== bucket ||
         nsolid.statsd.format.tags() !== tags) {
    assert.ok(Date.now() < deadline, 'StatsD format did not update');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  console.log(`StatsD format: ${bucket} ${tags}`);
}

(async () => {
  const config = { app: 'app1', env: 'env1', hostname: 'host1', tags: ['tag1'] };
  nsolid.start({ ...config, statsd: 'udp://127.0.0.1:8125', interval: 0,
                 // eslint-disable-next-line no-template-curly-in-string
                 statsdBucket: '${app}.${env}.${hostname}',
                 // eslint-disable-next-line no-template-curly-in-string
                 statsdTags: '${app},${env},${hostname},${tags}' });
  await waitForFormat('app1.env1.host1', '|#app1,env1,host1,tag1');
  for (const change of [{ app: 'app2' }, { env: 'env2' },
                        { hostname: 'host2' }, { tags: ['tag2'] }, { tags: [] }]) {
    Object.assign(config, change);
    nsolid.start(change);
    await waitForFormat(`${config.app}.${config.env}.${config.hostname}`,
                        `|#${config.app},${config.env},${config.hostname},${config.tags.join(',')}`);
  }
  nsolid.start({ statsd: null });
})().catch((err) => { throw err; });
