import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import {
  checkExitData,
  TestPlayground,
} from '../common/nsolid-zmq-agent/index.js';

/**
 * data has this format:
 * {
    agentId: '1a3ff062d4c016000bd4a8bd33f22c002d6ed6b3',
    requestId: '5625b2d3-55b7-4660-84d1-5ad6f003f933',
    command: 'heap_profile',
    duration: 112,
    metadata: { reason: 'unspecified' },
    complete: false,
    threadId: 0,
    version: 4,
    bulkId: '5625b2d3-55b7-4660-84d1-5ad6f003f933'
  }
 */
function checkProfileData(requestId, options, agentId, data, complete, onExit = false) {
  assert.strictEqual(data.requestId, requestId);
  assert.strictEqual(data.agentId, agentId);
  assert.strictEqual(data.command, 'heap_profile');
  if (!onExit) {
    assert.ok(data.duration > options.duration);
  }
  assert.strictEqual(data.complete, complete);
  assert.strictEqual(data.threadId, options.threadId);
  assert.strictEqual(data.version, 4);
  assert.strictEqual(data.bulkId, requestId);
}

const tests = [];
const trackAllocations = [false, true];
for (const track of trackAllocations) {
  tests.push({
    name: `should work for the main thread with trackAllocations=${track}`,
    test: async (playground) => {
      return new Promise((resolve) => {
        let events = 0;
        let profile = '';
        let requestId;
        const options = {
          duration: 100,
          threadId: 0,
          trackAllocations: track,
        };

        const bootstrapOpts = {
          // Just to be sure we don't receive the loop_blocked event
          opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 } }
        };

        playground.bootstrap(bootstrapOpts, mustSucceed((agentId) => {
          requestId = playground.zmqAgentBus.agentHeapProfileStart(agentId, options);
        }), (eventType, agentId, data) => {
          console.log(`[${eventType}] ${agentId}}`);
          switch (++events) {
            case 1:
              assert.strictEqual(eventType, 'asset-data-packet');
              if (data.packet.length > 0) {
                checkProfileData(requestId, options, agentId, data.metadata, false);
                profile += data.packet;
                --events;
              } else {
                checkProfileData(requestId, options, agentId, data.metadata, true);
              }
              break;
            case 2:
            {
              assert.strictEqual(eventType, 'asset-received');
              checkProfileData(requestId, options, agentId, data, true);
              const heapProf = JSON.parse(profile);
              if (track === true) {
                assert.ok(heapProf.snapshot.trace_function_count > 0);
                assert.ok(heapProf.trace_function_infos.length > 0);
                assert.ok(heapProf.trace_tree.length > 0);
              } else {
                assert.strictEqual(heapProf.snapshot.trace_function_count, 0);
                assert.strictEqual(heapProf.trace_function_infos.length, 0);
                assert.strictEqual(heapProf.trace_tree.length, 0);
              }
              resolve();
            }
          }
        });
      });
    },
  });

  tests.push({
    name: `should work for worker threads with trackAllocations=${track}`,
    test: async (playground) => {
      return new Promise((resolve) => {
        let events = 0;
        let profile = '';
        let requestId;
        const options = {
          duration: 100,
          trackAllocations: track,
        };

        const bootstrapOpts = {
          args: [ '-w', 1 ],
          // Just to be sure we don't receive the loop_blocked event
          opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 } }
        };

        playground.bootstrap(bootstrapOpts, mustSucceed(async (agentId) => {
          // Need to get the id's of the worker threads from the metrics first.
          const workers = await playground.client.workers();
          options.threadId = workers[0];
          requestId = playground.zmqAgentBus.agentHeapProfileStart(agentId, options);
        }), (eventType, agentId, data) => {
          console.log(`[${eventType}] ${agentId}}`);
          switch (++events) {
            case 1:
              assert.strictEqual(eventType, 'asset-data-packet');
              if (data.packet.length > 0) {
                checkProfileData(requestId, options, agentId, data.metadata, false);
                profile += data.packet;
                --events;
              } else {
                checkProfileData(requestId, options, agentId, data.metadata, true);
              }
              break;
            case 2:
            {
              assert.strictEqual(eventType, 'asset-received');
              checkProfileData(requestId, options, agentId, data, true);
              const heapProf = JSON.parse(profile);
              if (track === true) {
                assert.ok(heapProf.snapshot.trace_function_count > 0);
                assert.ok(heapProf.trace_function_infos.length > 0);
                assert.ok(heapProf.trace_tree.length > 0);
              } else {
                assert.strictEqual(heapProf.snapshot.trace_function_count, 0);
                assert.strictEqual(heapProf.trace_function_infos.length, 0);
                assert.strictEqual(heapProf.trace_tree.length, 0);
              }
              resolve();
            }
          }
        });
      });
    },
  });
}

tests.push({
  name: 'should return 410 if sent to a non-existant thread',
  test: async (playground) => {
    return new Promise((resolve) => {
      const options = {
        duration: 100,
        threadId: 10,
      };

      playground.bootstrap(mustSucceed((agentId) => {
        playground.zmqAgentBus.agentHeapProfileStart(agentId, options, mustCall((err) => {
          assert.strictEqual(err.code, 410);
          assert.strictEqual(err.message, 'Thread already gone');
          resolve();
        }));
      }));
    });
  },
});

tests.push({
  name: 'should return 422 if invalid threadId field',
  test: async (playground) => {
    return new Promise((resolve) => {
      const options = {
        duration: 100,
        threadId: 'wth',
      };

      playground.bootstrap(mustSucceed((agentId) => {
        playground.zmqAgentBus.agentHeapProfileStart(agentId, options, mustCall((err) => {
          assert.strictEqual(err.code, 422);
          assert.strictEqual(err.message, 'Invalid arguments');
          resolve();
        }));
      }));
    });
  },
});

tests.push({
  name: 'should return 422 if invalid duration field',
  test: async (playground) => {
    return new Promise((resolve) => {
      const options = {
        duration: 'wth',
      };

      playground.bootstrap(mustSucceed((agentId) => {
        playground.zmqAgentBus.agentHeapProfileStart(agentId, options, mustCall((err) => {
          assert.strictEqual(err.code, 422);
          assert.strictEqual(err.message, 'Invalid arguments');
          resolve();
        }));
      }));
    });
  },
});

tests.push({
  name: 'should return 422 if invalid trackAllocations field',
  test: async (playground) => {
    return new Promise((resolve) => {
      const options = {
        trackAllocations: 'wth',
      };

      playground.bootstrap(mustSucceed((agentId) => {
        playground.zmqAgentBus.agentHeapProfileStart(agentId, options, mustCall((err) => {
          assert.strictEqual(err.code, 422);
          assert.strictEqual(err.message, 'Invalid arguments');
          resolve();
        }));
      }));
    });
  },
});

tests.push({
  name: 'should return 422 no args field',
  test: async (playground) => {
    return new Promise((resolve) => {
      const options = null;

      playground.bootstrap(mustSucceed((agentId) => {
        playground.zmqAgentBus.agentHeapProfileStart(agentId, options, mustCall((err) => {
          assert.strictEqual(err.code, 422);
          assert.strictEqual(err.message, 'Invalid arguments');
          resolve();
        }));
      }));
    });
  },
});

tests.push({
  name: 'should return 409 if profile in progress in main thread',
  test: async (playground) => {
    return new Promise((resolve) => {
      let events = 0;
      let profile = '';
      let requestId;
      const options = {
        duration: 100,
        threadId: 0,
      };

      const bootstrapOpts = {
        // Just to be sure we don't receive the loop_blocked event
        opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 } }
      };

      playground.bootstrap(bootstrapOpts, mustSucceed((agentId) => {
        requestId = playground.zmqAgentBus.agentHeapProfileStart(agentId, options);
        playground.zmqAgentBus.agentHeapProfileStart(agentId, options, mustCall((err) => {
          assert.strictEqual(err.code, 409);
          assert.strictEqual(err.message, 'Profile already in progress');
        }));
      }), (eventType, agentId, data) => {
        switch (++events) {
          case 1:
            assert.strictEqual(eventType, 'asset-data-packet');
            if (data.packet.length > 0) {
              checkProfileData(requestId, options, agentId, data.metadata, false);
              profile += data.packet;
              --events;
            } else {
              checkProfileData(requestId, options, agentId, data.metadata, true);
            }
            break;
          case 2:
            assert.strictEqual(eventType, 'asset-received');
            checkProfileData(requestId, options, agentId, data, true);
            JSON.parse(profile);
            resolve();
        }
      });
    });
  },
});

tests.push({
  name: 'should return 409 if profile in progress in worker',
  test: async (playground) => {
    return new Promise((resolve) => {
      let events = 0;
      let profile = '';
      let requestId;
      const options = {
        duration: 100,
      };

      const bootstrapOpts = {
        args: [ '-w', 1 ],
        // Just to be sure we don't receive the loop_blocked event
        opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 } }
      };

      playground.bootstrap(bootstrapOpts, mustSucceed(async (agentId) => {
        // Need to get the id's of the worker threads from the metrics first.
        const workers = await playground.client.workers();
        options.threadId = workers[0];
        requestId = playground.zmqAgentBus.agentHeapProfileStart(agentId, options);
        playground.zmqAgentBus.agentHeapProfileStart(agentId, options, mustCall((err) => {
          assert.strictEqual(err.code, 409);
          assert.strictEqual(err.message, 'Profile already in progress');
        }));
      }), (eventType, agentId, data) => {
        switch (++events) {
          case 1:
            assert.strictEqual(eventType, 'asset-data-packet');
            if (data.packet.length > 0) {
              checkProfileData(requestId, options, agentId, data.metadata, false);
              profile += data.packet;
              --events;
            } else {
              checkProfileData(requestId, options, agentId, data.metadata, true);
            }
            break;
          case 2:
            assert.strictEqual(eventType, 'asset-received');
            checkProfileData(requestId, options, agentId, data, true);
            JSON.parse(profile);
            resolve();
        }
      });
    });
  },
});

tests.push({
  name: 'should end an ongoing profile before exiting',
  test: async (playground) => {
    return new Promise((resolve) => {
      let events = 0;
      let profile = '';
      let requestId;
      const options = {
        duration: 1000,
        threadId: 0,
      };

      let gotExit = false;
      let gotProfile = false;
      let processExited = false;

      const bootstrapOpts = {
        // Just to be sure we don't receive the loop_blocked event
        opts: { env: { NSOLID_BLOCKED_LOOP_THRESHOLD: 10000 } }
      };

      playground.bootstrap(bootstrapOpts, mustSucceed((agentId) => {
        requestId = playground.zmqAgentBus.agentHeapProfileStart(agentId, options);
        setTimeout(async () => {
          const exit = await playground.client.shutdown(0);
          assert.ok(exit);
          assert.strictEqual(exit.code, 0);
          assert.strictEqual(exit.signal, null);
          if (gotProfile && gotExit) {
            resolve();
          } else {
            processExited = true;
          }
        }, 100);
      }), (eventType, agentId, data) => {
        if (eventType === 'agent-exit') {
          assert.strictEqual(gotExit, false);
          checkExitData(data, { exit_code: 0, error: null });
          gotExit = true;
          if (gotProfile && processExited) {
            resolve();
          }
        } else {
          switch (++events) {
            case 1:
              assert.strictEqual(eventType, 'asset-data-packet');
              if (data.packet.length > 0) {
                checkProfileData(requestId, options, agentId, data.metadata, false, true);
                profile += data.packet;
                --events;
              } else {
                checkProfileData(requestId, options, agentId, data.metadata, true, true);
              }
              break;
            case 2:
              assert.strictEqual(gotProfile, false);
              assert.strictEqual(eventType, 'asset-received');
              checkProfileData(requestId, options, agentId, data, true, true);
              JSON.parse(profile);
              gotProfile = true;
              if (gotExit && processExited) {
                resolve();
              }
          }
        }
      });
    });
  },
});

const config = {
  commandBindAddr: 'tcp://*:9001',
  dataBindAddr: 'tcp://*:9002',
  bulkBindAddr: 'tcp://*:9003',
  HWM: 0,
  bulkHWM: 0,
  commandTimeoutMilliseconds: 5000,
};


for (const saas of [false, true]) {
  config.saas = saas;
  const label = saas ? 'saas' : 'local';
  const playground = new TestPlayground(config);
  await playground.startServer();

  for (const { name, test } of tests) {
    console.log(`[${label}] profile command ${name}`);
    await test(playground);
    await playground.stopClient();
  }

  await playground.stopServer();
}
