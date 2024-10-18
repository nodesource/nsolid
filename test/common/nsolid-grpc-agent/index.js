'use strict';

const common = require('../');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

const {
  validateArray,
  validateObject,
  validateString,
} = require('internal/validators');

const defaultSaasToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaalocalhost:9001';

function checkExitData(data, metadata, agentId, expectedData) {
  console.dir(data, { depth: null });
  assert.strictEqual(data.common.requestId, '');
  assert.strictEqual(data.common.command, 'exit');
  // From here check at least that all the fields are present
  validateObject(data.common.recorded, 'recorded');
  const recSeconds = BigInt(data.common.recorded.seconds);
  assert.ok(recSeconds);
  const recNanoSecs = BigInt(data.common.recorded.nanoseconds);
  assert.ok(recNanoSecs);
  validateObject(data.body, 'body');
  // also the body fields
  assert.strictEqual(data.body.code, expectedData.code);
  assert.strictEqual(data.body.profile, expectedData.profile);
  if (expectedData.error === null) {
    assert.strictEqual(data.body.error, null);
  } else {
    assert.ok(data.body.error);
    assert.strictEqual(data.body.error.message, expectedData.error.message);
    validateString(data.body.error.stack, 'error.stack');
  }

  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

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
      switch (message.type) {
        case 'exit':
          this.emit('exit', message.data);
          break;
        case 'loop_blocked':
          this.emit('loop_blocked', message.data);
          break;
        case 'loop_unblocked':
          this.emit('loop_unblocked', message.data);
          break;
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

  async cpuProfile(agentId, options) {
    return new Promise((resolve) => {
      if (this.#server) {
        const requestId = randomUUID();
        this.#server.send({ type: 'profile', agentId, requestId, options });
        const msgListener = (msg) => {
          if (msg.type === 'profile' && msg.data.msg.common.requestId === requestId) {
            this.#server.off('message', msgListener);
            resolve({ requestId, data: msg.data });
          }
        };
        this.#server.on('message', msgListener);
      } else {
        resolve(null);
      }
    });
  }

  async heapProfile(agentId, options) {
    return new Promise((resolve) => {
      if (this.#server) {
        const requestId = randomUUID();
        this.#server.send({ type: 'heap_profile', agentId, requestId, options });
        const msgListener = (msg) => {
          if (msg.type === 'heap_profile' && msg.data.msg.common.requestId === requestId) {
            this.#server.off('message', msgListener);
            resolve({ requestId, data: msg.data });
          }
        };
        this.#server.on('message', msgListener);
      } else {
        resolve(null);
      }
    });
  }

  async heapSampling(agentId, options) {
    return new Promise((resolve) => {
      if (this.#server) {
        const requestId = randomUUID();
        this.#server.send({ type: 'heap_sampling', agentId, requestId, options });
        const msgListener = (msg) => {
          if (msg.type === 'heap_sampling' && msg.data.msg.common.requestId === requestId) {
            this.#server.off('message', msgListener);
            resolve({ requestId, data: msg.data });
          }
        };
        this.#server.on('message', msgListener);
      } else {
        resolve(null);
      }
    });
  }

  async heapSnapshot(agentId, options) {
    return new Promise((resolve) => {
      if (this.#server) {
        const requestId = randomUUID();
        this.#server.send({ type: 'snapshot', agentId, requestId, options });
        const msgListener = (msg) => {
          if (msg.type === 'snapshot' && msg.data.msg.common.requestId === requestId) {
            this.#server.off('message', msgListener);
            resolve({ requestId, data: msg.data });
          }
        };
        this.#server.on('message', msgListener);
      } else {
        resolve(null);
      }
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

  async metrics(agentId) {
    return new Promise((resolve) => {
      if (this.#server) {
        const requestId = randomUUID();
        this.#server.send({ type: 'metrics', agentId, requestId });
        this.#server.once('message', (msg) => {
          if (msg.type === 'metrics') {
            resolve({ requestId, data: msg.data });
          }
        });
      } else {
        resolve(null);
      }
    });
  }

  async packages(agentId) {
    return new Promise((resolve) => {
      if (this.#server) {
        const requestId = randomUUID();
        this.#server.send({ type: 'packages', agentId, requestId });
        this.#server.once('message', (msg) => {
          if (msg.type === 'packages') {
            resolve({ requestId, data: msg.data });
          }
        });
      } else {
        resolve(null);
      }
    });
  }

  async startupTimes(agentId) {
    return new Promise((resolve) => {
      if (this.#server) {
        const requestId = randomUUID();
        this.#server.send({ type: 'startup_times', agentId, requestId });
        this.#server.once('message', (msg) => {
          if (msg.type === 'startup_times') {
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

const defaultForkOpts = {
  env: {
    NODE_DEBUG: process.env.NODE_DEBUG,
    NODE_DEBUG_NATIVE: process.env.NODE_DEBUG_NATIVE,
  },
};

class TestClient {
  #child;
  constructor(args = [], options = {}) {
    const opts = { ...defaultForkOpts };
    Object.keys(options).forEach((key) => {
      opts[key] = { ...opts[key], ...options[key] };
    });

    this.#child = fork(path.join(__dirname, 'client.js') + '', args, opts);
    this.#child.on('exit', (code, signal) => {
      console.log(`child process exited with code ${code} and signal ${signal}`);
    });
  }

  async block(threadId, duration) {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'block', threadId, duration }, () => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async config() {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'config' });
        this.#child.once('message', common.mustCall((msg) => {
          if (msg.type === 'config') {
            resolve(msg.config);
          }
        }));
      } else {
        resolve(null);
      }
    });
  }

  async exception(msg) {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'shutdown', error: msg });
        this.#child.once('exit', common.mustCall((code, signal) => {
          this.#child = null;
          resolve({ code, signal });
        }));
      } else {
        resolve();
      }
    });
  }

  async id() {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'id' });
        this.#child.once('message', common.mustCall((msg) => {
          if (msg.type === 'id') {
            resolve(msg.id);
          }
        }));
      } else {
        resolve(null);
      }
    });
  }

  async kill(signal) {
    return new Promise((resolve) => {
      let done = false;
      if (this.#child) {
        this.#child.once('exit', common.mustCall((code, signal) => {
          this.#child = null;
          done = true;
          resolve({ code, signal });
        }));
        // This should not be needed but for some reason the child is not always
        // killed on the first attempt.
        const interval = setInterval(() => {
          if (!done) {
            this.#child.kill();
          } else {
            clearInterval(interval);
          }
        }, 100);
      } else {
        resolve();
      }
    });
  }

  async metrics() {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'metrics' });
        this.#child.once('message', common.mustCall((msg) => {
          if (msg.type === 'metrics') {
            resolve(msg.metrics);
          }
        }));
      } else {
        resolve(null);
      }
    });
  }


  async shutdown(code) {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'shutdown', code });
        this.#child.once('exit', common.mustCall((code, signal) => {
          this.#child = null;
          resolve({ code, signal });
        }));
      } else {
        resolve();
      }
    });
  }

  async startupTimes(name) {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'startupTimes', name });
        this.#child.once('message', common.mustCall((msg) => {
          if (msg.type === 'startupTimes' && msg.name === name) {
            resolve(true);
          }
        }));
      } else {
        resolve(false);
      }
    });
  }

  async threadName(threadId, name) {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'threadName', threadId, name });
        this.#child.once('message', common.mustCall((msg) => {
          if (msg.type === 'threadName' && msg.threadId === threadId) {
            resolve(true);
          }
        }));
      } else {
        resolve(false);
      }
    });
  }

  async tracing(kind, threadId) {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'trace', kind, threadId }, () => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async workers() {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'workers' });
        this.#child.once('message', common.mustCall((msg) => {
          if (msg.type === 'workers') {
            resolve(msg.ids);
          }
        }));
      } else {
        resolve([]);
      }
    });
  }

  child() {
    return this.#child;
  }
}

module.exports = {
  checkExitData,
  GRPCServer,
  TestClient
};
