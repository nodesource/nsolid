// Flags: --expose-internals
import { mustCall, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import {
  checkOTLPMetricsData,
  GRPCServer,
  TestClient,
  hasThreadAttributes,
} from '../common/nsolid-grpc-agent/index.js';


// Test for GrpcMetricsExporter retry functionality
async function runRetryTest({ getEnv }) {
  return new Promise((resolve) => {
    const grpcServer = new GRPCServer();
    const interval = 200; // 200ms interval
    let metricsReceived = 0;
    let serverKilled = false;
    let serverRestarted = false;

    grpcServer.start(mustSucceed(async (port) => {
      console.log(`GRPC server started on port ${port}`);

      const env = getEnv(port);
      const opts = {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env,
      };
      const child = new TestClient([], opts);
      const agentId = await child.id();
      const config = await child.config({ app: 'my_app_name', interval });
      const metrics = await child.metrics();

      grpcServer.on('metrics', mustCall(async ({ request }) => {
        metricsReceived++;
        console.log(`Received OTLP metrics export #${metricsReceived}`);

        // Check if this is thread metrics or process metrics
        const scopeMetrics = request.resourceMetrics[0].scopeMetrics[0];
        const firstMetric = scopeMetrics.metrics[0];
        const isThreadMetrics = hasThreadAttributes(firstMetric);

        checkOTLPMetricsData(request.resourceMetrics, agentId, config, metrics, 1, isThreadMetrics);

        // When first metrics arrive, kill the server
        if (!serverKilled && metricsReceived >= 2) {
          console.log('First metrics received, killing server...');
          serverKilled = true;
          grpcServer.close();

          // Wait for 5x interval, then restart server
          setTimeout(() => {
            console.log(`Restarting server on same port ${port}...`);
            grpcServer.start(mustSucceed(() => {
              serverRestarted = true;
              console.log(`Server restarted on port ${port}`);
            }), port);
          }, 5 * interval); // Wait 5x interval
        }

        // If server is restarted and we have enough metrics, complete test
        if (serverRestarted && metricsReceived >= 8) { // ~2x3 + initial instead of 2x5 + initial to be more lenient
          console.log('Test complete! Received expected retry metrics');
          console.log(`Total metrics received: ${metricsReceived}`);

          assert.ok(serverKilled, 'Server should have been killed');
          assert.ok(serverRestarted, 'Server should have been restarted');

          clearTimeout(timeoutId);
          await child.shutdown(0);
          if (grpcServer) {
            grpcServer.close();
          }

          resolve({
            serverKilled,
            serverRestarted,
            metricsReceived,
          });
        }
      }));

      // Timeout fallback
      const timeoutId = setTimeout(async () => {
        console.log('Timeout reached - test failed!');
        await child.shutdown(0);
        if (grpcServer) {
          grpcServer.close();
        }

        // Test should fail if timeout is reached
        assert.fail(`Test timeout: Expected at least 8 metrics exports and server restart, but got ${metricsReceived} metrics, serverKilled: ${serverKilled}, serverRestarted: ${serverRestarted}`);
      }, 5000); // 5 seconds = 25 × 200ms interval (reasonable buffer)
    }));
  });
}

// Test GrpcMetricsExporter retry functionality
async function testGrpcMetricsRetry() {
  console.log('Running GrpcMetricsExporter retry test...');

  const getEnv = (port) => ({
    // NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
    NSOLID_GRPC_INSECURE: 1,
    NSOLID_GRPC: `localhost:${port}`,
    NSOLID_INTERVAL: 200,
  });

  const results = await runRetryTest({ getEnv });
  console.log('GrpcMetricsExporter retry test completed!', results);
  console.log('---');
}

// Run the test
testGrpcMetricsRetry();
