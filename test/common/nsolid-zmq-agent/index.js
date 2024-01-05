'use strict';

const common = require('../');
const assert = require('node:assert');
const ZmqAgentBus = require('./zmqagentbus');
const fixtures = require('../fixtures');
const { fork } = require('node:child_process');

const SIGTERM = 15;

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

const State = {
  INIT: 0,
  CONNECTED: 1,
};

const defaultForkOpts = {
  env: {
    NSOLID_COMMAND: 9001,
    NODE_DEBUG_NATIVE: process.env.NODE_DEBUG_NATIVE,
  },
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
};

const eventTypes = [
  'agent-connected',
  'agent-ping',
  'agent-info',
  'agent-metrics',
  'agent-packages',
  'agent-startup-times',
  'agent-tracing',
  'loop_blocked',
  'loop_unblocked',
  'agent-exit',
  'asset-received',
  'asset-data-packet',
  'agent-error',
];

class TestClient {
  #child;
  constructor(args = [], options = {}) {
    const opts = { ...defaultForkOpts };
    Object.keys(options).forEach((key) => {
      opts[key] = { ...opts[key], ...options[key] };
    });
    this.#child = fork(fixtures.path('nsolid-start.js'), args, opts);
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
      if (this.#child) {
        this.#child.kill(signal);
        this.#child.once('exit', common.mustCall((code, signal) => {
          this.#child = null;
          resolve({ code, signal });
        }));
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
        this.#child.on('message', common.mustCall((msg) => {
          if (msg.type === 'startupTimes' && msg.name === name) {
            resolve(true);
          }
        }));
      } else {
        resolve(false);
      }
    });
  }

  async workers() {
    return new Promise((resolve) => {
      if (this.#child) {
        this.#child.send({ type: 'workers' });
        this.#child.on('message', common.mustCall((msg) => {
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
  #state;
  #bootstrapState;
  constructor(config) {
    this.zmqAgentBus = new ZmqAgentBus(config);
    this.#state = State.INIT;
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

  stopServer() {
    this.zmqAgentBus.shutdown();
  }

  bootstrap(options, done, next) {
    if (typeof options === 'function') {
      next = done;
      done = options;
      options = {};
    }

    options = options || {};

    let id;
    let events = 0;
    eventTypes.forEach((eventType) => {
      this.zmqAgentBus.on(eventType, (agentId, data) => {
        console.log(`[${events}] ${eventType}, ${agentId}`);
        try {
          if (!id) {
            id = agentId;
          } else {
            assert.strictEqual(id, agentId);
          }

          switch (++events) {
            case 1:
              assert.strictEqual(eventType, 'agent-connected');
              this.#state = State.CONNECTED;
              break;
            case 2:
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
    this.client = new TestClient(options.args, opts);
  }

  async stopClient() {
    this.#unsubscribeAll();
    if (this.#clientAlive()) {
      this.zmqAgentBus.on('agent-exit', common.mustCall((agentId, data) => {
        checkExitData(data, { exit_code: SIGTERM, error: null });
        this.#unsubscribeAll();
      }));
      const exit = await this.client.kill();
      assert.strictEqual(exit.code, null);
      assert.strictEqual(exit.signal, 'SIGTERM');
    }
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
