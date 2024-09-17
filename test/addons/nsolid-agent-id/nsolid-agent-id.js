'use strict';
const common = require('../../common');
const assert = require('assert');
const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);
const nsolid = require('nsolid');

assert.strictEqual(binding.agentId(), nsolid.id);
