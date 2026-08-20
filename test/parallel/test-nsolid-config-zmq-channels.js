'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');

const channels = [ 'command', 'data', 'bulk' ];
channels.forEach((channel, index) => {
  [ true, /a/, Symbol(), () => {} ].forEach((arg) => {
    assert.throws(
      () => {
        nsolid.start({
          [channel]: arg
        });
      },
      {
        message: `The "config.${channel}" property must be of type string.` +
                 common.invalidArgTypeHelper(arg),
        code: 'ERR_INVALID_ARG_TYPE'
      }
    );
  });

  nsolid.start({
    [channel]: 9000 + index
  });

  assert.strictEqual(nsolid.config[channel], `localhost:${9000 + index}`);

  nsolid.start({
    [channel]: `localhost:${9000 + index}`
  });

  assert.strictEqual(nsolid.config[channel], `localhost:${9000 + index}`);
});
