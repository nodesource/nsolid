'use strict';

const { buildType, skip } = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${buildType}/binding`);
const binding = require(bindingPath);
const nsolid = require('nsolid');
const { isMainThread } = require('worker_threads');

if (!isMainThread && +process.argv[2] !== process.pid)
  skip('Test must first run as the main thread');

const moduleInfo = JSON.parse(binding.getModuleInfo(0));
assert.deepStrictEqual(moduleInfo, []);
assert.deepStrictEqual(moduleInfo, nsolid.packages());

// TODO(trevnorris): Check module info from worker threads.
