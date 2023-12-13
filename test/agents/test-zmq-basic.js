'use strict';

const common = require('../common');
const fixtures = require('../common/fixtures');
const assert = require('node:assert');
const { fork, spawn } = require('node:child_process');
const { after, afterEach, before, describe, it } = require('node:test');
const {
  AgentBus,
  ZmqAgentBus,
} = require('nsolid-connector');

const SIGTERM = 15;

const config = {
  commandBindAddr: 'tcp://*:9001',
  dataBindAddr: 'tcp://*:9002',
  bulkBindAddr: 'tcp://*:9003',
  privateKey: "2).NRO5d[JbEFli7F@hdvE1(Fv?B6iIAn>NcLLDx",
  HWM: 0,
  bulkHWM: 0,
  commandTimeoutMilliseconds: 5000
};

function checkExitData(data, expected) {
  assert.strictEqual(data.exit_code, expected.exit_code);
  assert.strictEqual(data.error, expected.error);
}

function bootstrapSequence(done, next) {
  let id;
  let events = 0;
  this.agentBus.eventTypes.forEach(eventType => {
    this.agentBus.subscribe(eventType, (agentId, data) => {
      console.log(`[${events}] ${eventType}, ${agentId}`);
      if (!id) {
        id = agentId;
      } else {
        assert.strictEqual(id, agentId);
      }

      switch (++events) {
        case 1:
          assert.strictEqual(eventType, 'agent-connected');
        break;
        case 2:
          assert.strictEqual(eventType, 'agent-info');
          // parse info data
        break;
        case 3:
          assert.strictEqual(eventType, 'agent-packages');
          // parse packages data
        break;
        case 4:
          assert.strictEqual(eventType, 'agent-metrics');
          done(null, agentId);
        break;
        default:
          next(eventType, agentId, data);
      }
    });
  });
}

describe('basic boostrap and exit', () => {
  before(async () => {
    this.bootstrapSequence = bootstrapSequence.bind(this);
    this.zmqAgentBus = new ZmqAgentBus(config);
    this.agentBus = new AgentBus(this.zmqAgentBus);
    return new Promise((resolve) => {
      this.zmqAgentBus.start(common.mustSucceed(() => {
        console.log('zmq nsolid agent server started');
        resolve();
      }));
    });
  });

  it('should work if agent is killed with signal', (t, done) => {
    try {
      this.bootstrapSequence(() => {
        child.kill();
      }, (eventType, agentId, data) => {
        assert.strictEqual(eventType, 'agent-exit');
        checkExitData(data, { exit_code: SIGTERM, error: null });
        done();
      });
    } catch (err) {
      done(err);
    }

    const child = spawn(process.execPath, { env: { NSOLID_COMMAND: 9001 } });
    child.on('exit', common.mustCall((code, signal) => {
      assert.strictEqual(code, null);
      assert.strictEqual(signal, 'SIGTERM');
    }));
  });

  it('should work if agent exits gracefully without error', (t, done) => {
    try {
      this.bootstrapSequence(() => {
        child.send({ type: 'shutdown', code: 0 });
      }, (eventType, agentId, data) => {
        assert.strictEqual(eventType, 'agent-exit');
        checkExitData(data, { exit_code: 0, error: null });
        done();
      });
    } catch (err) {
      done(err);
    }


    const child = fork(fixtures.path('nsolid-start.js'), [], {
      env: { NSOLID_COMMAND: 9001 },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });
    child.on('exit', common.mustCall((code, signal) => {
      assert.strictEqual(code, 0);
      assert.strictEqual(signal, null);
    }));
  });

  it('should work if agent exits gracefully with error code', (t, done) => {
    try {
      this.bootstrapSequence(() => {
        child.send({ type: 'shutdown', code: 1 });
      }, (eventType, agentId, data) => {
        assert.strictEqual(eventType, 'agent-exit');
        checkExitData(data, { exit_code: 1, error: null });
        done();
      });
    } catch (err) {
      done(err);
    }

    const child = fork(fixtures.path('nsolid-start.js'), [], {
      env: { NSOLID_COMMAND: 9001 },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });
    child.on('exit', common.mustCall((code, signal) => {
      assert.strictEqual(code, 1);
      assert.strictEqual(signal, null);
    }));
  });

  it('should work if agent exits with exception', (t, done) => {
    try {
      this.bootstrapSequence(() => {
        child.send({ type: 'shutdown', error: true });
      }, (eventType, agentId, data) => {
        assert.strictEqual(eventType, 'agent-exit');
        assert.strictEqual(data.exit_code, 1);
        assert.strictEqual(data.error.code, 500);
        assert.strictEqual(data.error.message, 'Uncaught Error: error');
        assert.ok(data.error.stack);
        done();
      });
    } catch (err) {
      done(err);
    }

    const child = fork(fixtures.path('nsolid-start.js'), [], {
      env: { NSOLID_COMMAND: 9001 },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });
    child.on('exit', common.mustCall((code, signal) => {
      assert.strictEqual(code, 1);
      assert.strictEqual(signal, null);
    }));
  });

  afterEach(() => {
    this.agentBus.unsubscribeAll();
  });

  after(() => {
    this.agentBus.shutdown();
  });
});

describe('cpu profiling', () => {
  before(async () => {
    this.bootstrapSequence = bootstrapSequence.bind(this);
    this.zmqAgentBus = new ZmqAgentBus(config);
    this.agentBus = new AgentBus(this.zmqAgentBus);
    return new Promise((resolve) => {
      this.zmqAgentBus.start(common.mustSucceed(() => {
        console.log('zmq nsolid agent server started');
        resolve();
      }));
    });
  });

  it('should work if agent is killed with signal', (t, done) => {
    try {
      this.bootstrapSequence(common.mustSucceed((agentId) => {
        this.agentBus.agentProfileStart(agentId);
      }), (eventType, agentId, data) => {
        console.log(eventType, agentId, data);
        assert.strictEqual(eventType, 'agent-exit');
        checkExitData(data, { exit_code: SIGTERM, error: null });
        done();
      });
    } catch (err) {
      done(err);
    }

    const child = spawn(process.execPath, 
                        { env: { NSOLID_COMMAND: 9001,
                                 NODE_DEBUG_NATIVE: 'nsolid_zmq_agent' },
                          stdio: ['inherit', 'inherit', 'inherit', 'ipc']});
    child.on('exit', common.mustCall((code, signal) => {
      assert.strictEqual(code, null);
      assert.strictEqual(signal, 'SIGTERM');
    }));
  });

  afterEach(() => {
    this.agentBus.unsubscribeAll();
  });

  after(() => {
    this.agentBus.shutdown();
  });
});