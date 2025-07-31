'use strict';

const nsolid = require('nsolid');

if (!process.env.NSOLID_COMMAND)
  throw new Error('NSOLID_COMMAND not set');

nsolid.start();

setTimeout(() => {
  if (nsolid.zmq.status() !== 'ready') {
    process._rawDebug('Not connected to ZMQ');
    process.exit(1);
  }
}, 500);
