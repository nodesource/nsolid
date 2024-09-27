'use strict';

const { EventEmitter } = require('node:events');
const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

class GRPCServer extends EventEmitter {
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
    this.#server = fork(path.join(__dirname, 'server.mjs') + '', args, opts);
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

  async info(agentId) {
    return new Promise((resolve) => {
      if (this.#server) {
        const requestId = randomUUID();
        this.#server.send({ type: 'info', agentId, requestId });
        this.#server.once('message', (msg) => {
          if (msg.type === 'info') {
            resolve({ requestId, data: msg.data });
          }
        });
      } else {
        resolve(null);
      }
    });
  }

  close() {
    this.#server.send({ type: 'close' });
  }
}

module.exports = {
  GRPCServer
};
