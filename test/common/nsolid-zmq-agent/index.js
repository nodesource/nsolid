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
  DONE: (1 << 0) | (1 << 1) | (1 << 2),
};

const defaultForkOpts = {
  env: {
    NSOLID_COMMAND: 9001,
    NODE_DEBUG: process.env.NODE_DEBUG,
    NODE_DEBUG_NATIVE: process.env.NODE_DEBUG_NATIVE,
  },
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

  async config(config = null) {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'config', config });
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

  async enableTraces() {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'enableTraces' }, () => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async disableTraces() {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'disableTraces' }, () => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async enableAssets() {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'enableAssets' }, () => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async disableAssets() {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'disableAssets' }, () => {
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
  constructor(config) {
    this.zmqAgentBus = new ZmqAgentBus(config);
    this.#config = config;
    this.client = null;
  }

  updateConfig(config) {
    this.zmqAgentBus.updateConfig(config);
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

    options ||= {};

    const state = {
      id: null,
      events: this.#config.saas ? -1 : 0,
      authCount: 0,
      bootstrap: BootstrapState.INIT,
    };
    eventTypes.forEach((eventType) => {
      this.zmqAgentBus.on(eventType, (agentId, data) => {
        console.log(`[${state.events}] ${eventType}, ${agentId}`);
        this.detectInitialSequence(state, eventType, data, agentId, done, next);
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

  #checkInitialSequence(eventType) {
    switch (eventType) {
      case 'agent-info':
        return BootstrapState.GOTINFO;
      case 'agent-packages':
        return BootstrapState.GOTPACKAGES;
      case 'agent-metrics':
        return BootstrapState.GOTMETRICS;
      default:
        return BootstrapState.INIT;
    }
  }

  #clientAlive() {
    return this.client && this.client.child();
  }

  detectInitialSequence(state, eventType, data, agentId, done, next) {
    try {
      if (!state.id) {
        state.id = agentId;
      } else if (eventType !== 'agent-authorized') {
        assert.strictEqual(state.id, agentId);
      }

      if (state.bootstrap === BootstrapState.DONE) {
        if (this.#config.saas) {
          assert.strictEqual(state.authCount, 3);
        }
        // The agent sends metrics periodically, and they'd interleave with
        // the sequences the tests check. Once it reconnects, though, its
        // initial sequence, metrics included, is the test's to check.
        if (eventType === 'agent-connected')
          state.reconnected = true;
        if (next && (state.reconnected || eventType !== 'agent-metrics'))
          next(eventType, agentId, data);
        return;
      }

      switch (++state.events) {
        case 0:
          assert.strictEqual(eventType, 'agent-authorized');
          ++state.authCount;
          break;
        case 1:
          assert.strictEqual(eventType, 'agent-connected');
          break;
        default:
          // Then info, packages and metrics, in any order, metrics maybe more
          // than once. With SaaS, the agent is authorized again meanwhile.
          if (this.#config.saas && eventType === 'agent-authorized') {
            ++state.authCount;
            break;
          }

          state.bootstrap |= this.#checkInitialSequence(eventType);
          if (state.bootstrap === BootstrapState.DONE) {
            done(null, agentId);
          }
      }
    } catch (err) {
      this.stopClient();
      done(err);
    }
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
