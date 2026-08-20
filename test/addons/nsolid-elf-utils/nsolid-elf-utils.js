'use strict';
const common = require('../../common');
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const process = require('process');
const fixtures = require('../../common/fixtures');

// Only run on Linux
if (process.platform !== 'linux') {
  console.log('Skipping: nsolid-elf-utils only supported on Linux');
  process.exit(0);
}

const bindingPath = require.resolve(`./build/${common.buildType}/binding`);
const binding = require(bindingPath);

const readelfOutput = execFileSync('readelf', ['-n', process.execPath],
                                   { encoding: 'utf8' });
const expected = readelfOutput.match(/Build ID:\s+([0-9a-f]+)/i)[1];

const buildId = binding.getBuildId(process.execPath);
assert.strictEqual(buildId,
                   expected,
                   `Mismatch: addon='${buildId}', readelf='${expected}'`);

const fixtureHex = fixtures.readSync(['elf', 'build-id-no-sections.hex'], 'utf8');
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nsolid-elf-utils-'));
const fixturePath = path.join(fixtureDir, 'build-id-no-sections');
const replacementPath = path.join(fixtureDir, 'replacement');
const fixture = Buffer.from(fixtureHex.replace(/\s/g, ''), 'hex');
try {
  fs.writeFileSync(fixturePath, fixture);
  assert.strictEqual(binding.getBuildId(fixturePath),
                     '00112233445566778899aabbccddeeff00112233');

  const replacement = Buffer.from(fixture);
  const buildId = Buffer.from('00112233445566778899aabbccddeeff00112233',
                              'hex');
  const buildIdOffset = replacement.indexOf(buildId);
  assert.notStrictEqual(buildIdOffset, -1);
  replacement[buildIdOffset] = 0xff;
  fs.writeFileSync(replacementPath, replacement);
  fs.renameSync(replacementPath, fixturePath);
  assert.strictEqual(binding.getBuildId(fixturePath),
                     'ff112233445566778899aabbccddeeff00112233');
} finally {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
}
