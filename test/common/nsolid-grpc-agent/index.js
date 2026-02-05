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


function checkExitData(data, metadata, agentId, expectedData) {
  console.dir(data, { depth: null });
  validateString(data.common.requestId, 'common.requestId');
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

function checkResource(resource, agentId, config, metrics) {
  validateArray(resource.attributes, 'attributes');

  const expectedAttributes = {
    'telemetry.sdk.version': process.versions.opentelemetry,
    'telemetry.sdk.language': 'cpp',
    'telemetry.sdk.name': 'opentelemetry',
    'service.instance.id': agentId,
    'service.name': config.app,
    'service.version': config.appVersion,
  };

  if (metrics) {
    expectedAttributes['process.title'] = metrics.title;
    expectedAttributes['process.owner'] = metrics.user;
  }

  assert.strictEqual(resource.attributes.length, Object.keys(expectedAttributes).length);

  resource.attributes.forEach((attribute) => {
    assert.strictEqual(attribute.value.stringValue, expectedAttributes[attribute.key]);
    delete expectedAttributes[attribute.key];
  });

  assert.strictEqual(Object.keys(expectedAttributes).length, 0);
}


class GRPCServer extends EventEmitter {
  #opts;
  #server;
  constructor(opts) {
    super();
    this.#server = null;
    this.#opts = opts || {};
  }

  start(cb) {
    const args = [];
    if (this.#opts.tls) {
      args.push('--tls');
    }

    const opts = {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    };
    this.#server = fork(path.join(__dirname, 'server.mjs'), args, opts);
    this.#server.on('message', (message) => {
      switch (message.type) {
        case 'exit':
          this.emit('exit', message.data);
          break;
        case 'heap_profile':
          this.emit('heap_profile', message.data);
          break;
        case 'heap_sampling':
          this.emit('heap_sampling', message.data);
          break;
        case 'logs':
          this.emit('logs', message.data);
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
        case 'metrics_cmd':
          this.emit('metrics_cmd', message.data);
          break;
        case 'profile':
          this.emit('profile', message.data);
          break;
        case 'reconfigure':
          this.emit('reconfigure', message.data);
          break;
        case 'snapshot':
          this.emit('snapshot', message.data);
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
        this.#server.on('message', (msg) => {
          if (msg.type === 'metrics_cmd') {
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

  async reconfigure(agentId, config = null) {
    return new Promise((resolve) => {
      if (this.#server) {
        const requestId = randomUUID();
        // Create a message handler that checks for the specific message type
        const messageHandler = (msg) => {
          if (msg.type === 'reconfigure' &&
              msg.data.msg.common.requestId === requestId) {
            this.#server.removeListener('message', messageHandler);
            resolve({ data: msg.data, requestId });
          }
        };

        this.#server.on('message', messageHandler);
        this.#server.send({ type: 'reconfigure', agentId, config, requestId });
      } else {
        resolve(null);
      }
    });
  }

  async sourceCode(agentId, options) {
    return new Promise((resolve) => {
      if (this.#server) {
        const requestId = randomUUID();
        this.#server.send({ type: 'source_code', agentId, requestId, options });
        this.#server.on('message', (msg) => {
          if (msg.type === 'source_code') {
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

  async config(config = null) {
    if (!this.#child)
      return null;
    return this.#sendAndWait({
      type: 'config',
      payload: { config },
      expect: 'config',
      map: (msg) => msg.config,
    });
  }

  async enableAssets() {
    if (!this.#child)
      return;
    await this.#sendAndWait({ type: 'enable_assets' });
  }

  async disableAssets() {
    if (!this.#child)
      return;
    await this.#sendAndWait({ type: 'disable_assets' });
  }

  async enableTraces() {
    if (!this.#child)
      return;
    await this.#sendAndWait({ type: 'enable_traces' });
  }

  async disableTraces() {
    if (!this.#child)
      return;
    await this.#sendAndWait({ type: 'disable_traces' });
  }

  async trace(kind, targetThreadId = 0) {
    if (!this.#child)
      return;
    await new Promise((resolve) => {
      this.#child.send({ type: 'trace', kind, threadId: targetThreadId }, resolve);
    });
  }

  #sendAndWait({ type, payload = {}, expect = type, map }) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.#child.off('message', handler);
        resolve(map ? map(null) : undefined);
      }, 30000); // 30 second timeout

      const handler = (msg) => {
        if (msg.type !== expect)
          return;
        clearTimeout(timeout);
        this.#child.off('message', handler);
        resolve(map ? map(msg) : undefined);
      };

      this.#child.on('message', handler);
      this.#child.send({ type, ...payload });
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

  async heapProfile(duration) {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'heap_profile', duration }, () => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async heapSampling(duration) {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'heap_sampling', duration }, () => {
          resolve();
        });
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

  async importURL(url, threadId) {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'import', url, threadId });
        this.#child.on('message', (msg) => {
          if (msg.type === 'import') {
            resolve();
          }
        });
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

  async log(threadId, level, message) {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'log', level, message, threadId });
        this.#child.once('message', common.mustCall((msg) => {
          if (msg.type === 'log') {
            resolve();
          }
        }));
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

  async profile(duration) {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'profile', duration }, () => {
          resolve();
        });
      } else {
        resolve();
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

  async snapshot(duration) {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'snapshot', duration }, () => {
          resolve();
        });
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
  checkResource,
  GRPCServer,
  TestClient,
};
