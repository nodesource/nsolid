'use strict';
const common = require('../common');
const assert = require('assert');
const fs = require('fs');
if (process.env.NSOLID_COMMAND)
  common.skip('test not compatible with NSolid Console');

// Test that using FileHandle.close to close an already-closed fd fails
// with EBADF.

(async function() {
  const fh = await fs.promises.open(__filename);
  fs.closeSync(fh.fd);

  await assert.rejects(() => fh.close(), {
    code: 'EBADF',
    syscall: 'close'
  });
})().then(common.mustCall());
