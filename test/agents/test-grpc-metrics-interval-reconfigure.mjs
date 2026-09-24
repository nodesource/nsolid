// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { setTimeout as delay } from 'node:timers/promises';
import {
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

const INITIAL_INTERVAL = 600;
const UPDATED_INTERVAL = 100;
const FAST_INTERVAL_UPPER_BOUND = 300;
const METRICS_TIMEOUT_MS = 1500;

function waitForMetricsEvent(grpcServer, timeoutMs = METRICS_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      grpcServer.off('metrics', onMetrics);
      reject(new Error(`Timed out waiting for metrics event after ${timeoutMs}ms`));
    }, timeoutMs);

    function onMetrics() {
      clearTimeout(timer);
      grpcServer.off('metrics', onMetrics);
      resolve(Date.now());
    }

    grpcServer.on('metrics', onMetrics);
  });
}

async function collectMetricsEventTimestamps(grpcServer,
                                             count,
                                             timeoutMs = METRICS_TIMEOUT_MS) {
  const timestamps = [];
  const deadline = Date.now() + timeoutMs;

  while (timestamps.length < count) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }

    timestamps.push(await waitForMetricsEvent(grpcServer, remaining));
  }

  return timestamps;
}

async function runTest({ getEnv }) {
  return new Promise((resolve) => {
    const grpcServer = new GRPCServer();
    grpcServer.start(mustSucceed(async (port) => {
      const env = getEnv(port);
      const opts = {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env,
      };
      const child = new TestClient([], opts);
      const agentId = await child.id();
      const initialConfig = await child.config({ interval: INITIAL_INTERVAL });
      assert.strictEqual(initialConfig.interval, INITIAL_INTERVAL);

      // Wait for one periodic metrics push so the next interval boundary is
      // well-defined before reconfiguring.
      await waitForMetricsEvent(grpcServer, INITIAL_INTERVAL * 3);

      const { data, requestId } = await grpcServer.reconfigure(agentId, {
        interval: UPDATED_INTERVAL,
      });
      assert.strictEqual(data.msg.common.requestId, requestId);
      assert.strictEqual(Number(data.msg.body.interval), UPDATED_INTERVAL);

      const updatedConfig = await child.config();
      assert.strictEqual(updatedConfig.interval, UPDATED_INTERVAL);

      const timestamps = await collectMetricsEventTimestamps(grpcServer,
                                                             3,
                                                             METRICS_TIMEOUT_MS);
      assert.strictEqual(
        timestamps.length,
        3,
        `Expected 3 metrics events after reconfigure, got ${timestamps.length}`,
      );

      const deltas = [
        timestamps[1] - timestamps[0],
        timestamps[2] - timestamps[1],
      ];
      for (const delta of deltas) {
        assert.ok(
          delta < FAST_INTERVAL_UPPER_BOUND,
          `Expected fast metrics cadence after reconfigure, got ${delta}ms`,
        );
      }

      await child.shutdown(0);
      grpcServer.close();
      resolve();
    }));
  });
}

const testConfigs = [
  {
    getEnv: (port) => {
      return {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_GRPC: `localhost:${port}`,
      };
    },
  },
  {
    getEnv: (port) => {
      return {
        NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_SAAS: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbtesting.localhost:${port}`,
      };
    },
  },
];

for (const testConfig of testConfigs) {
  await runTest(testConfig);
  await delay(100);
}
