// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import {
  checkOTLPMetricsData,
  GRPCServer,
  TestClient,
  hasThreadAttributes,
} from '../common/nsolid-grpc-agent/index.js';

// Test for NSOLID_METRICS_BUFFER_SIZE functionality
async function runBufferSizeTest({ getEnv, bufferSize }) {
  return new Promise((resolve) => {
    const grpcServer = new GRPCServer();
    const interval = 200; // 200ms interval
    let metricsReceived = 0;
    const targetMetrics = 5; // Just test basic functionality

    grpcServer.start(mustSucceed(async (port) => {
      console.log(`GRPC server started ${port} with buffer size: ${bufferSize}`);
      const env = getEnv(port);
      const opts = {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: { ...process.env, ...env },
      };
      const child = new TestClient([], opts);
      const agentId = await child.id();
      const config = await child.config({ app: 'buffer_test_app', interval });
      const metrics = await child.metrics();

      grpcServer.on('metrics', async (data) => {
        metricsReceived++;
        console.log(`Received OTLP metrics export #${metricsReceived}`);

        // Check if this is thread metrics or process metrics
        const scopeMetrics = data.resourceMetrics[0].scopeMetrics[0];
        const firstMetric = scopeMetrics.metrics[0];
        const isThreadMetrics = hasThreadAttributes(firstMetric);

        checkOTLPMetricsData(data.resourceMetrics, agentId, config, metrics, 1, isThreadMetrics);

        if (metricsReceived >= targetMetrics) {
          console.log(`Buffer size test complete! Received ${metricsReceived} metrics with buffer size ${bufferSize}`);

          clearTimeout(timeoutId);
          await child.shutdown(0);
          if (grpcServer) {
            grpcServer.close();
          }

          resolve({
            bufferSize,
            metricsReceived,
          });
        }
      });

      // Timeout fallback
      const timeoutId = setTimeout(async () => {
        console.log('Timeout reached - test failed!');
        await child.shutdown(0);
        if (grpcServer) {
          grpcServer.close();
        }

        assert.fail(`Test timeout: Expected at least ${targetMetrics} metrics exports with buffer size ${bufferSize}, but got ${metricsReceived}`);
      }, 5000);
    }));
  });
}

// Test different buffer sizes
async function testGrpcMetricsBufferSize() {
  console.log('Running GrpcMetricsExporter buffer size tests...');

  const testCases = [
    { bufferSize: 10, name: 'Small buffer (10)' },
    { bufferSize: 50, name: 'Medium buffer (50)' },
    { bufferSize: 200, name: 'Large buffer (200)' },
  ];

  for (const testCase of testCases) {
    console.log(`\n--- Testing ${testCase.name} ---`);

    const getEnv = (port) => ({
      NSOLID_GRPC_INSECURE: 1,
      NSOLID_GRPC: `localhost:${port}`,
      NSOLID_INTERVAL: 200,
      NSOLID_METRICS_BUFFER_SIZE: testCase.bufferSize,
    });

    const results = await runBufferSizeTest({ getEnv, bufferSize: testCase.bufferSize });
    console.log(`✓ ${testCase.name} test passed!`, results);
  }

  console.log('\nAll buffer size tests completed successfully!');
}

// Run the test
testGrpcMetricsBufferSize();
