'use strict';

const { EventEmitter } = require('node:events');
const { fork } = require('node:child_process');
const path = require('node:path');

class OTLPServer extends EventEmitter {
  #server;
  constructor() {
    super();
    this.#server = null;
  }

  start(cb) {
    const args = [];
    const opts = {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    };
    this.#server = fork(path.join(__dirname, 'otlp-server.mjs') + '', args, opts);
    this.#server.on('message', (message) => {
      // console.dir(message, { depth: null });
      switch (message.type) {
        case 'metrics':
          this.emit('metrics', message.data);
          break;
        case 'spans':
          this.emit('spans', message.data);
          break;
        case 'port':
          cb(null, message.port);
          break;
      }
    });
    this.#server.on('exit', (code, signal) => {
      this.#server = null;
    });
  }

  close() {
    this.#server.send({ type: 'close' });
  }
}

module.exports = {
  OTLPServer,
};
