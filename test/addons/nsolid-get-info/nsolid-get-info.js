'use strict';

const { buildType, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const binding = require(bindingPath);
const nsolid = require('nsolid');
const { isMainThread, threadId } = require('worker_threads');

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Test must first run as the main thread');

try {
  require('../../../tools/node_modules/eslint');
} catch {
  // It's ok to ignore exceptions here.
}

const isNumber = (a) => typeof a === 'number';
const isObject = (a) => typeof a === 'object';
const isString = (a) => typeof a === 'string';
const isUndefined = (a) => typeof a === 'undefined';

// In nsolid.v3x there's no need to call start to retrieve the info.
nsolid.start();

let info = JSON.parse(binding.getProcessInfo());
assert.strictEqual(info.tags.length, 0);

nsolid.start({
  tags: [ 'hello', 'goodbye' ],
});

info = JSON.parse(binding.getProcessInfo());
assert.strictEqual(info.tags.length, 2);
assert.ok(info.tags.includes('hello'));
assert.ok(info.tags.includes('goodbye'));
assert.strictEqual(JSON.stringify(info), JSON.stringify(nsolid.info()));

const expectedInfoFormat = {
  id: [ isString ],
  app: [ isString ],
  appVersion: [ isString, isUndefined ],
  tags: [ Array.isArray ],
  pid: [ isNumber ],
  processStart: [ isNumber ],
  nodeEnv: [ isString ],
  execPath: [ isString ],
  main: [ isString ],
  arch: [ isString ],
  platform: [ isString ],
  hostname: [ isString ],
  totalMem: [ isNumber ],
  versions: {
    node: [ isString ],
    nsolid: [ isString ],
    v8: [ isString ],
    uv: [ isString ],
    zlib: [ isString ],
    brotli: [ isString ],
    ares: [ isString ],
    modules: [ isString ],
    nghttp2: [ isString ],
    napi: [ isString ],
    llhttp: [ isString ],
    http_parser: [ isString ],
    openssl: [ isString ],
    cldr: [ isString ],
    icu: [ isString ],
    tz: [ isString ],
    unicode: [ isString ],
  },
  cpuCores: [ isNumber ],
  cpuModel: [ isString ],
};

const infoProps = Object.keys(info);
const expectedInfoProps = Object.keys(expectedInfoFormat);
// As appVersion can be undefined and stringifying an undefined property
// causes its removal.
assert.ok(infoProps.length === expectedInfoProps.length ||
          infoProps.length + 1 === expectedInfoProps.length);

function checkPropsInObject(obj, expected) {
  Object.keys(expected).forEach((k) => {
    const fns = expectedInfoFormat[k];
    if (Array.isArray(fns)) {
      assert.ok(fns.some((fn) => fn(obj[k])));
    } else if (isObject(fns)) {
      checkPropsInObject(obj[k], fns);
    }
  });
}

checkPropsInObject(info, expectedInfoFormat);


// Test package info between JS and native APIs.

const p1 = JSON.parse(binding.getModuleInfo(threadId));
const p2 = JSON.parse(JSON.stringify(nsolid.packages()));
const o1 = {};
const o2 = {};

assert.strictEqual(p1.length, p2.length);

for (const o of p1) {
  assert.ok(!o1[o.path]);
  o1[o.path] = o;
}

for (const o of p2) {
  assert.ok(!o2[o.path]);
  o2[o.path] = o;
}

assert.deepStrictEqual(o1, o2);

// TODO(trevnorris): Check this from worker thread.
