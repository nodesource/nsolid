// Flags: --expose-internals

import { mustCall, mustSucceed } from '../common/index.mjs';
import { GRPCServer, TestClient } from '../common/nsolid-grpc-agent/index.js';

import assert from 'node:assert';

const services = [
  { name: 'ExportInfo', trigger: (client, s, id) => s.info(id), event: 'info' },
  { name: 'ExportMetricsCmd', trigger: (client, s, id) => s.metrics(id), event: 'metrics_cmd' },
  { name: 'ExportSpans', trigger: (client, s, id) => client.trace('http'), event: 'spans' },
];

const tests = [];

tests.push({
  name: 'should retry on transient UNAVAILABLE and succeed',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port);
        const client = new TestClient([], { env });
        const agentId = await client.id();

        let completed = 0;
        const total = services.length;

        for (const svc of services) {
          // Inject failure for the first call
          grpcServer.injectFailure(svc.name, 'UNAVAILABLE', 1);

          if (svc.name === 'ExportSpans') {
            grpcServer.on(svc.event, mustCall(async (data) => {
              const attemptsHeader = data.metadata['grpc-previous-rpc-attempts'];
              assert(attemptsHeader && attemptsHeader[0] === '1', `Should have retried once for ${svc.name}, got ${attemptsHeader}`);
              completed++;
              if (completed === total) {
                grpcServer.clearFaults();
                await client.shutdown(0);
                grpcServer.close();
                resolve();
              }
            }));
            await client.trace('http');
            continue;
          }

          svc.trigger(client, grpcServer, agentId).then(async ({ data }) => {
            const attemptsHeader = data.metadata['grpc-previous-rpc-attempts'];
            assert(attemptsHeader && attemptsHeader[0] === '1', `Should have retried once for ${svc.name}, got ${attemptsHeader}`);
            completed++;
            if (completed === total) {
              grpcServer.clearFaults();
              await client.shutdown(0);
              grpcServer.close();
              resolve();
            }
          }).then(mustCall());
        }
      }));
    });
  },
});

tests.push({
  name: 'should fail after max retries (5) on persistent UNAVAILABLE',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port);
        const client = new TestClient([], { env });
        const agentId = await client.id();

        let completed = 0;
        const total = services.length;

        for (const svc of services) {
          // Inject failures for more than 5 attempts
          grpcServer.injectFailure(svc.name, 'UNAVAILABLE', 20);

          if (svc.name === 'ExportSpans') {
            const timeout = new Promise((resolveTimeout) => setTimeout(() => resolveTimeout('timeout'), 10000));
            const success = new Promise((resolve) => grpcServer.on(svc.event, () => resolve('success')));
            Promise.race([success, timeout]).then(async (result) => {
              if (result === 'timeout') {
                // Good, failed as expected due to exhausted retries
                completed++;
                if (completed === total) {
                  grpcServer.clearFaults();
                  await client.shutdown(0);
                  grpcServer.close();
                  resolve();
                }
              } else {
                throw new Error(`Should have failed after retries for ${svc.name}`);
              }
            }).then(mustCall());
          }

          const triggerPromise = svc.trigger(client, grpcServer, agentId);
          if (svc.name !== 'ExportSpans') {
            const timeout = new Promise((resolveTimeout) => setTimeout(() => resolveTimeout('timeout'), 20000));
            Promise.race([triggerPromise, timeout]).then(async (result) => {
              if (result === 'timeout') {
                // Good, failed as expected due to exhausted retries
                completed++;
                if (completed === total) {
                  grpcServer.clearFaults();
                  await client.shutdown(0);
                  grpcServer.close();
                  resolve();
                }
              } else {
                throw new Error(`Should have failed after retries for ${svc.name}`);
              }
            }).then(mustCall());
          }
        }
      }));
    });
  },
});

tests.push({
  name: 'should not retry on non-retryable DEADLINE_EXCEEDED',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = getEnv(port);
        const client = new TestClient([], { env });
        const agentId = await client.id();

        let completed = 0;
        const total = services.length;

        for (const svc of services) {
          grpcServer.injectFailure(svc.name, 'DEADLINE_EXCEEDED', 1);

          if (svc.name === 'ExportSpans') {
            const timeout = new Promise((resolveTimeout) => setTimeout(() => resolveTimeout('timeout'), 1000));
            const success = new Promise((resolve) => grpcServer.on(svc.event, () => resolve('success')));
            Promise.race([success, timeout]).then(async (result) => {
              if (result === 'timeout') {
                // Good, failed immediately without retries
                completed++;
                if (completed === total) {
                  await client.shutdown(0);
                  grpcServer.clearFaults();
                  grpcServer.close();
                  resolve();
                }
              } else {
                await client.shutdown(0);
                throw new Error(`Should have failed immediately for ${svc.name}`);
              }
            }).then(mustCall());
          }

          const triggerPromise = svc.trigger(client, grpcServer, agentId);
          if (svc.name !== 'ExportSpans') {
            const timeout = new Promise((resolveTimeout) => setTimeout(() => resolveTimeout('timeout'), 1000));
            Promise.race([triggerPromise, timeout]).then(async (result) => {
              if (result === 'timeout') {
                // Good, failed immediately without retries
                completed++;
                if (completed === total) {
                  await client.shutdown(0);
                  grpcServer.clearFaults();
                  grpcServer.close();
                  resolve();
                }
              } else {
                await client.shutdown(0);
                throw new Error(`Should have failed immediately for ${svc.name}`);
              }
            }).then(mustCall());
          }
        }
      }));
    });
  },
});

tests.push({
  name: 'should enforce custom deadline from NSOLID_GRPC_DEADLINE',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        // Inject 2s delay on services
        for (const svc of services) {
          grpcServer.injectDelay(svc.name, 2000);
        }

        const env = { ...getEnv(port), NSOLID_GRPC_DEADLINE: '1' };
        const client = new TestClient([], { env });
        const agentId = await client.id();

        let completed = 0;
        const total = services.length;

        for (const svc of services) {
          if (svc.name === 'ExportSpans') {
            const timeout = new Promise((resolveTimeout) => setTimeout(() => resolveTimeout('timeout'), 2000));
            const success = new Promise((resolve) => grpcServer.on(svc.event, () => resolve('success')));
            Promise.race([success, timeout]).then(async (result) => {
              if (result === 'timeout') {
                // Good, timed out due to deadline
                completed++;
                if (completed === total) {
                  await client.shutdown(0);
                  grpcServer.clearFaults();
                  grpcServer.close();
                  resolve();
                }
              } else {
                throw new Error(`Should have timed out for ${svc.name}`);
              }
            }).then(mustCall());
            continue;
          }

          const triggerPromise = svc.trigger(client, grpcServer, agentId);
          if (svc.name !== 'ExportSpans') {
            const timeout = new Promise((resolveTimeout) => setTimeout(() => resolveTimeout('timeout'), 2000));
            Promise.race([triggerPromise, timeout]).then(async (result) => {
              if (result === 'timeout') {
                // Good, timed out due to deadline
                completed++;
                if (completed === total) {
                  await client.shutdown(0);
                  grpcServer.clearFaults();
                  grpcServer.close();
                  resolve();
                }
              } else {
                await client.shutdown(0);
                throw new Error(`Should have timed out for ${svc.name}`);
              }
            }).then(mustCall());
          }
        }
      }));
    });
  },
});

tests.push({
  name: 'should use default 10s deadline when env not set',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        // Inject short delay, should succeed
        for (const svc of services) {
          grpcServer.injectDelay(svc.name, 500);
        }

        const env = getEnv(port);
        const client = new TestClient([], { env });
        const agentId = await client.id();

        let completed = 0;
        const total = services.length;

        for (const svc of services) {
          if (svc.name === 'ExportSpans') {
            grpcServer.on(svc.event, mustCall(async () => {
              completed++;
              if (completed === total) {
                await client.shutdown(0);
                grpcServer.clearFaults();
                grpcServer.close();
                resolve();
              }
            }));

            await client.trace('http');
            continue;
          }

          const promise = svc.trigger(client, grpcServer, agentId);
          promise.then(async () => {
            completed++;
            if (completed === total) {
              await client.shutdown(0);
              grpcServer.clearFaults();
              grpcServer.close();
              resolve();
            }
          }).then(mustCall());
        }
      }));
    });
  },
});

tests.push({
  name: 'should handle invalid NSOLID_GRPC_DEADLINE gracefully',
  test: async (getEnv) => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        // Inject delay, should succeed with default 10s
        for (const svc of services) {
          grpcServer.injectDelay(svc.name, 1000);
        }

        const env = { ...getEnv(port), NSOLID_GRPC_DEADLINE: 'invalid' };
        const client = new TestClient([], { env });
        const agentId = await client.id();

        let completed = 0;
        const total = services.length;

        for (const svc of services) {
          if (svc.name === 'ExportSpans') {
            grpcServer.on(svc.event, mustCall(async () => {
              completed++;
              if (completed === total) {
                await client.shutdown(0);
                grpcServer.clearFaults();
                grpcServer.close();
                resolve();
              }
            }));
          }

          const promise = svc.trigger(client, grpcServer, agentId);
          if (svc.name !== 'ExportSpans') {
            promise.then(async () => {
              completed++;
              if (completed === total) {
                await client.shutdown(0);
                grpcServer.clearFaults();
                grpcServer.close();
                resolve();
              }
            }).then(mustCall());
          }
        }
      }));
    });
  },
});

const testConfigs = [
  {
    getEnv: (port) => ({
      NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
      NSOLID_GRPC: `localhost:${port}`,
      NSOLID_GRPC_INSECURE: 1,
      NSOLID_TRACING_ENABLED: 1,
    }),
  },
];

for (const testConfig of testConfigs) {
  for (const { name, test } of tests) {
    console.log(`[retry-policies] ${name}`);
    await test(testConfig.getEnv);
  }
}
