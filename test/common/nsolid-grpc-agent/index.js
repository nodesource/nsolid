'use strict';

const common = require('../');
const { EventEmitter } = require('node:events');
const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

const {
  checkExitData,
  checkResource,
  checkOTLPMetricsData,
  hasThreadAttributes,
} = require('./validators.js');


class GRPCServer extends EventEmitter {
  #opts;
  #server;
  constructor(opts) {
    super();
    this.#server = null;
    this.#opts = opts || {};
  }

  start(cb, port = null) {
    const args = [ '--port' ];
    if (port) {
      args.push(port.toString());
    } else {
      args.push('0');
    }

    if (this.#opts.tls) {
      args.push('--tls');
    }
    const opts = {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    };
    this.#server = fork(path.join(__dirname, 'server.mjs'), args, opts);
    this.#server.on('message', (message) => {
      console.log('message', message);
      switch (message.type) {
        case 'command':
          this.emit('command', message.data);
          break;
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
        const msgListener = (msg) => {
          if (msg.type === 'info' && msg.data.msg.common.requestId === requestId) {
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

  async metrics(agentId) {
    return new Promise((resolve) => {
      if (this.#server) {
        const requestId = randomUUID();
        this.#server.send({ type: 'metrics', agentId, requestId });
        const msgListener = (msg) => {
          if (msg.type === 'metrics_cmd' && msg.data.msg.common.requestId === requestId) {
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

  injectFailure(service, status = 'UNAVAILABLE', count = 1) {
    if (this.#server) {
      this.#server.send({ type: 'inject_failure', service, status, count });
    }
  }

  injectDelay(service, delayMs = 0) {
    if (this.#server) {
      this.#server.send({ type: 'inject_delay', service, delay: delayMs });
    }
  }

  clearFaults() {
    if (this.#server) {
      this.#server.send({ type: 'clear_faults' });
    }
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
  checkOTLPMetricsData,
  hasThreadAttributes,
  GRPCServer,
  TestClient,
};
