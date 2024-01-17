'use strict';

const common = require('../');
const assert = require('node:assert');
const path = require('node:path');
const ZmqAgentBus = require('./zmqagentbus');
const { fork } = require('node:child_process');

function checkExitData(data, expected) {
  assert.strictEqual(data.exit_code, expected.exit_code);
  assert.strictEqual(data.error, expected.error);
}

const BootstrapState = {
  INIT: 0,
  GOTINFO: 1 << 0,
  GOTPACKAGES: 1 << 1,
  GOTMETRICS: 1 << 2,
};

const defaultForkOpts = {
  env: {
    NSOLID_COMMAND: 9001,
    NODE_DEBUG: process.env.NODE_DEBUG,
    NODE_DEBUG_NATIVE: process.env.NODE_DEBUG_NATIVE,
  },
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
};

const defaultSaasToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaalocalhost:9001';

const eventTypes = [
  'agent-connected',
  'agent-ping',
  'agent-info',
  'agent-metrics',
  'agent-packages',
  'agent-startup-times',
  'agent-tracing',
  'agent-loop_blocked',
  'agent-loop_unblocked',
  'agent-exit',
  'asset-received',
  'asset-data-packet',
  'agent-error',
  'agent-authorized',
  'agent-unauthorized',
];

class TestClient {
  #child;
  constructor(args = [], options = {}) {
    const opts = { ...defaultForkOpts };
    Object.keys(options).forEach((key) => {
      opts[key] = { ...opts[key], ...options[key] };
    });
    if (opts.env.NSOLID_SAAS) {
      delete opts.env.NSOLID_COMMAND;
    }

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

class TestPlayground {
  client;
  #config;
  #bootstrapState;
  constructor(config) {
    this.zmqAgentBus = new ZmqAgentBus(config);
    this.#config = config;
    this.#bootstrapState = BootstrapState.INIT;
    this.client = null;
  }

  async startServer() {
    return new Promise((resolve) => {
      this.zmqAgentBus.start((err) => {
        assert.ifError(err);
        resolve();
      });
    });
  }

  async stopServer() {
    return new Promise((resolve) => {
      this.zmqAgentBus.shutdown((err) => {
        assert.ifError(err);
        resolve();
      });
    });
  }

  bootstrap(options, done, next) {
    if (typeof options === 'function') {
      next = done;
      done = options;
      options = {};
    }

    options = options || {};

    let id;
    let events = this.#config.saas ? -1 : 0;
    let authCount = 0;
    eventTypes.forEach((eventType) => {
      this.zmqAgentBus.on(eventType, (agentId, data) => {
        console.log(`[${events}] ${eventType}, ${agentId}`);
        try {
          if (!id) {
            id = agentId;
          } else if (eventType !== 'agent-authorized') {
            assert.strictEqual(id, agentId);
          }

          switch (++events) {
            case 0:
              assert.strictEqual(eventType, 'agent-authorized');
              ++authCount;
              break;
            case 1:
              assert.strictEqual(eventType, 'agent-connected');
              break;
            case 2:
              if (this.#config.saas && eventType === 'agent-authorized') {
                --events;
                ++authCount;
              }

              this.#checkInitialSequence(eventType, data);
              // The runtime may send metrics before the initial sequence is sent.
              if (eventType === 'agent-metrics') {
                --events;
              }
              break;
            case 3:
              this.#checkInitialSequence(eventType, data);
              break;
            case 4:
              this.#checkInitialSequence(eventType, data);
              assert.ok(this.#bootstrapState &&
                        (BootstrapState.GOTINFO | BootstrapState.GOTPACKAGES | BootstrapState.GOTMETRICS));
              done(null, agentId);
              break;
            default:
              if (this.#config.saas) {
                // There should be 3 auth events, one per channel.
                assert.strictEqual(authCount, 3);
              }
              if (next)
                next(eventType, agentId, data);
          }
        } catch (err) {
          this.stopClient();
          done(err);
        }
      });
    });

    assert.ok(!this.#clientAlive());
    const opts = { ...options.opts };
    opts.env = { NSOLID_PUBKEY: this.zmqAgentBus.server.keyPair.public, ...opts.env };
    if (this.#config.saas) {
      opts.env.NSOLID_SAAS = defaultSaasToken;
      opts.env.NSOLID_AUTH_URL = `http://localhost:${this.zmqAgentBus.server.authServer.address().port}`;
    }

    this.client = new TestClient(options.args, opts);
  }

  async stopClient() {
    return new Promise((resolve) => {
      let calls = 0;
      this.#unsubscribeAll();
      if (this.#clientAlive()) {
        this.zmqAgentBus.on('agent-exit', common.mustCall((agentId, data) => {
          checkExitData(data, { exit_code: 0, error: null });
          this.#unsubscribeAll();
          if (++calls === 2) {
            resolve();
          }
        }));
        this.client.shutdown(0).then((exit) => {
          assert.strictEqual(exit.code, 0);
          assert.strictEqual(exit.signal, null);
          if (++calls === 2) {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  #checkInitialSequence(eventType, data) {
    if (eventType === 'agent-info') {
      this.#bootstrapState |= BootstrapState.GOTINFO;
      // parse info data
    } else if (eventType === 'agent-packages') {
      this.#bootstrapState |= BootstrapState.GOTPACKAGES;
      // parse packages data
    } else if (eventType === 'agent-metrics') {
      this.#bootstrapState |= BootstrapState.GOTMETRICS;
      // parse metrics data
    }
  }

  #clientAlive() {
    return this.client && this.client.child();
  }

  #unsubscribeAll() {
    eventTypes.forEach((eventType) => {
      this.zmqAgentBus.removeAllListeners(eventType);
    });
  }

}

module.exports = {
  checkExitData,
  TestPlayground,
};
