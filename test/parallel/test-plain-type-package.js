'use strict';

require('../common');
const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const file = path.join(__dirname,
                       '../fixtures/node_modules/plain-type-package/index.js');
const child = spawnSync(process.execPath, [ file ]);
assert.strictEqual(child.stdout.toString(), '');
