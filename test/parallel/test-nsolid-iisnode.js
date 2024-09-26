'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const { spawn } = require('child_process');

const env = {
  NSOLID_IISNODE: 1
};

if (process.argv[2]) {
  nsolid.start();
  nsolid.info(common.mustSucceed((info) => {
    assert.ok(info.main);
    assert.strictEqual(info.main, info.iisNodeMain);
  }));
} else if (process.env.NSOLID_IISNODE) {
  nsolid.start();
  nsolid.info(common.mustSucceed((info) => {
    assert.ok(info.main);
    assert.strictEqual(info.iisNodeMain, '');
  }));
} else {
  const cp1 = spawn(process.execPath, [ __filename, __filename ], { env });
  cp1.on('exit', common.mustCall((code) => {
    assert.strictEqual(code, 0);
  }));

  const cp2 = spawn(process.execPath, [ __filename ], { env });
  cp2.on('exit', common.mustCall((code) => {
    assert.strictEqual(code, 0);
  }));
}
