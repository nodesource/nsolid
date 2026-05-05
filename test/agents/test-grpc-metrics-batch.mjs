// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import {
  checkOTLPMetricsData,
  GRPCServer,
  TestClient,
  hasThreadAttributes,
} from '../common/nsolid-grpc-agent/index.js';


// Simple test for static batch sizes (no reconfiguration)
async function runSimpleTest({
  getEnv,
  expectedBatchSize = null,
  pauseMetricsAt = null,
}) {
  return new Promise((resolve) => {
    const grpcServer = new GRPCServer();
    grpcServer.start(mustSucceed(async (port) => {
      console.log('GRPC server started', port);
      const env = getEnv(port);
      const opts = {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env,
      };
      const child = new TestClient([], opts);
      const agentId = await child.id();
      const config = await child.config({ app: 'my_app_name', interval: 200 });

      let processMetricsReceived = false;
      let threadMetricsReceived = false;
      let pauseTimeout = null;
      let exportCount = 0;
      let pauseHappened = false;

      // Listen for OTLP metrics export (not the custom N|Solid metrics RPC)
      grpcServer.on('metrics', mustCall(async ({ request }) => {
        exportCount++;
        console.log(`Received OTLP metrics export #${exportCount}`);

        const metrics = await child.metrics();

        // The data should contain the OTLP ExportMetricsServiceRequest
        assert.ok(request, 'No metrics data received');
        assert.ok(request.resourceMetrics, 'Missing resourceMetrics in OTLP export');

        // Check if this is process or thread metrics based on attributes
        const scopeMetrics = request.resourceMetrics[0].scopeMetrics[0];
        const firstMetric = scopeMetrics.metrics[0];
        const isThreadMetrics = hasThreadAttributes(firstMetric);

        // Only treat exports as flushed if pause has actually happened
        // The expectFlushedBatch parameter indicates this test expects flush behavior,
        // but actual flushing only occurs after pauseHappened becomes true
        const isFlushedExport = pauseHappened;
        console.log(`Processing ${isThreadMetrics ? 'thread' : 'process'} metrics #${exportCount} (expectedBatchSize=${expectedBatchSize}, flushed=${isFlushedExport})`);

        checkOTLPMetricsData(request.resourceMetrics,
                             agentId,
                             config,
                             metrics,
                             expectedBatchSize,
                             isThreadMetrics,
                             isFlushedExport,
                             null);

        if (isThreadMetrics) {
          threadMetricsReceived = true;
        } else {
          processMetricsReceived = true;
        }

        // For pause tests, wait for 4 exports (2 initial + 2 flushed after pause)
        const expectedExports = pauseMetricsAt !== null ? 4 : 2;

        // Wait for both process and thread metrics before completing
        if (processMetricsReceived && threadMetricsReceived && exportCount >= expectedExports) {
          if (pauseTimeout) {
            clearTimeout(pauseTimeout);
          }
          console.log('All expected metrics exports received - test complete!');
          await child.shutdown(0);
          grpcServer.close();
          resolve();
        }
      }, pauseMetricsAt !== null ? 4 : 2));

      // If testing pause functionality, pause metrics after specified time
      if (pauseMetricsAt !== null) {
        pauseTimeout = setTimeout(async () => {
          console.log(`Pausing metrics after ${pauseMetricsAt}ms`);
          await grpcServer.reconfigure(agentId, { pauseMetrics: true });
          console.log('Metrics paused - waiting for flush...');
          pauseHappened = true; // Mark that pause has occurred

          // Give some time for the flush to happen, then complete
          setTimeout(async () => {
            if (!processMetricsReceived || !threadMetricsReceived) {
              console.log('No flush received within timeout - completing test');
              await child.shutdown(0);
              grpcServer.close();
              resolve();
            }
          }, 6000);
        }, pauseMetricsAt);
      }
    }));
  });
}

// Complex test for dynamic batch size reconfiguration with pause/unpause
async function runTest({
  getEnv,
  initialBatchSize = null,
  newBatchSize = null,
  reconfigureAt = null,
  expectFlushRange = null,
}) {
  return new Promise((resolve) => {
    const grpcServer = new GRPCServer();
    grpcServer.start(mustSucceed(async (port) => {
      console.log('GRPC server started', port);
      const env = getEnv(port);
      const opts = {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env,
      };
      const child = new TestClient([], opts);
      const agentId = await child.id();
      const config = await child.config({ app: 'my_app_name', interval: 200 });

      let processMetricsReceived = false;
      let threadMetricsReceived = false;

      // Export index across all OTLP metrics exports (process + thread)
      let exportIndex = 0;

      // Track if we've seen the first export after reconfigure
      let firstExportAfterReconfigure = false;

      // Listen for OTLP metrics export (not the custom N|Solid metrics RPC)
      grpcServer.on('metrics', mustCall(async ({ request }) => {
        exportIndex++;
        console.log(`Received OTLP metrics export #${exportIndex}`);

        const metrics = await child.metrics();

        // The data should contain the OTLP ExportMetricsServiceRequest
        assert.ok(request, 'No metrics data received');
        assert.ok(request.resourceMetrics, 'Missing resourceMetrics in OTLP export');

        // Check if this is process or thread metrics based on attributes
        const scopeMetrics = request.resourceMetrics[0].scopeMetrics[0];
        const firstMetric = scopeMetrics.metrics[0];
        const isThreadMetrics = hasThreadAttributes(firstMetric);

        // Determine expected batch size based on phase
        let phaseExpectedBatchSize;
        let phaseExpectFlushed;

        if (exportIndex <= 2) {
          // Phase 1: pre-reconfigure with initial batch size (partial)
          phaseExpectedBatchSize = initialBatchSize;
          phaseExpectFlushed = true;
        } else if (exportIndex <= 4) {
          // Phase 2: post-reconfigure with new batch size (partial)
          phaseExpectedBatchSize = newBatchSize;
          phaseExpectFlushed = true;
          if (exportIndex === 3 && !firstExportAfterReconfigure) {
            firstExportAfterReconfigure = true;
            console.log('First export after reconfigure received, will pause shortly...');
          }
        } else if (exportIndex <= 6) {
          // Phase 3: after pause/unpause flush (flushed batch)
          phaseExpectedBatchSize = newBatchSize;
          phaseExpectFlushed = true;
          if (expectFlushRange) {
            console.log(`Flush phase, expecting datapoints in range [${expectFlushRange[0]}, ${expectFlushRange[1]}]`);
          }
        } else {
          // Phase 4: first exports after flush (partial)
          phaseExpectedBatchSize = newBatchSize;
          phaseExpectFlushed = true;
        }

        console.log(`Processing ${isThreadMetrics ? 'thread' : 'process'} metrics export #${exportIndex} (expectedBatchSize=${phaseExpectedBatchSize}, flushed=${phaseExpectFlushed})`);

        checkOTLPMetricsData(request.resourceMetrics,
                             agentId,
                             config,
                             metrics,
                             phaseExpectedBatchSize,
                             isThreadMetrics,
                             phaseExpectFlushed,
                             expectFlushRange);

        if (isThreadMetrics) {
          threadMetricsReceived = true;
        } else {
          processMetricsReceived = true;
        }

        // Wait for both process and thread metrics before completing
        if (processMetricsReceived && threadMetricsReceived && exportIndex >= 8) {
          console.log('All expected metrics exports received - test complete!');
          await child.shutdown(0);
          grpcServer.close();
          resolve();
        }
      }, 8));

      // Reconfigure at specified time
      setTimeout(async () => {
        console.log(`Reconfiguring metricsBatchSize from ${initialBatchSize} to ${newBatchSize} after ${reconfigureAt}ms`);
        await grpcServer.reconfigure(agentId, { metricsBatchSize: newBatchSize });
        console.log(`Metrics batch size reconfigured to ${newBatchSize}`);
      }, reconfigureAt);

      // Pause after first export post-reconfigure
      const pauseCheckInterval = setInterval(async () => {
        if (firstExportAfterReconfigure) {
          clearInterval(pauseCheckInterval);
          console.log('Pausing metrics after first export post-reconfigure');
          await grpcServer.reconfigure(agentId, { pauseMetrics: true });
          console.log('Metrics paused');

          // Unpause after brief delay
          setTimeout(async () => {
            console.log('Unpausing metrics');
            await grpcServer.reconfigure(agentId, { pauseMetrics: false });
            console.log('Metrics unpaused');
          }, 1000);
        }
      }, 100);
    }));
  });
}

const testConfigs = [
  {
    name: 'default_batch_size',
    expectedBatchSize: 1,
    getEnv: (port) => ({
      NSOLID_GRPC_INSECURE: 1,
      NSOLID_GRPC: `localhost:${port}`,
      NSOLID_INTERVAL: 100,
    }),
  },
  // Test various static batch sizes
  ...[1, 3, 5].map((batchSize) => ({
    name: `batch_size_${batchSize}`,
    expectedBatchSize: batchSize,
    getEnv: (port) => ({
      NSOLID_GRPC_INSECURE: 1,
      NSOLID_GRPC: `localhost:${port}`,
      NSOLID_INTERVAL: 200,
      NSOLID_METRICS_BATCH_SIZE: batchSize,
    }),
  })),
  {
    name: 'pause_and_flush',
    expectedBatchSize: 1,
    pauseMetricsAt: 1200, // Pause after 1.2 seconds (should get ~6 datapoints at 200ms interval)
    getEnv: (port) => ({
      NSOLID_GRPC_INSECURE: 1,
      NSOLID_GRPC: `localhost:${port}`,
      NSOLID_INTERVAL: 200, // 200ms interval = 5 datapoints per second
    }),
  },
  {
    name: 'batchsize_increase_with_pause',
    initialBatchSize: 2,
    newBatchSize: 3,
    reconfigureAt: 600,
    expectFlushRange: [1, 5],
    getEnv: (port) => {
      return {
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_GRPC: `localhost:${port}`,
        NSOLID_INTERVAL: 300,
        NSOLID_METRICS_BATCH_SIZE: 2,
      };
    },
  },
  {
    name: 'batchsize_decrease_with_pause',
    initialBatchSize: 3,
    newBatchSize: 2,
    reconfigureAt: 400,
    expectFlushRange: [1, 5],
    getEnv: (port) => {
      return {
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_GRPC: `localhost:${port}`,
        NSOLID_INTERVAL: 300,
        NSOLID_METRICS_BATCH_SIZE: 3,
      };
    },
  },
];

for (const testConfig of testConfigs) {
  console.log(`Running test: ${testConfig.name}`);
  // Use complex test for reconfiguration scenarios, simple test otherwise
  if (testConfig.reconfigureAt !== undefined) {
    await runTest(testConfig);
  } else {
    await runSimpleTest(testConfig);
  }
  console.log(`Test ${testConfig.name} completed!`);
}
