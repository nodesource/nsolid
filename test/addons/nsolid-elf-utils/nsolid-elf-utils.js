'use strict';
const common = require('../../common');
const assert = require('assert');
const { execSync } = require('child_process');
const process = require('process');

// Only run on Linux
if (process.platform !== 'linux') {
  console.log('Skipping: nsolid-elf-utils only supported on Linux');
  process.exit(0);
}

const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const expected =
  execSync(`readelf -n ${process.execPath} | awk '/Build ID/ { print $3 }'`,
           { encoding: 'utf8' }).trim();

const buildId = binding.getBuildId(process.execPath);
assert.strictEqual(buildId,
                   expected,
                   `Mismatch: addon='${buildId}', readelf='${expected}'`);
