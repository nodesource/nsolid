// Flags: --expose-internals
import { mustSucceed } from '../../../common/index.mjs';
import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  GRPCServer,
} from '../../../common/nsolid-grpc-agent/index.js';
import validators from 'internal/validators';
import nsolid from 'nsolid';

const {
  validateArray,
} = validators;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Skip test if dependencies not installed
if (!existsSync(join(__dirname, 'node_modules'))) {
  console.log('SKIP: node_modules not found. Run "make test-integrations-prereqs" first.');
  process.exit(0);
}

const { default: express } = await import('express');

function getAttr(attributes, key) {
  return attributes.find((a) => a.key === key);
}

function checkHttpRouteAttribute(metricsData, expectedRoutes) {
  const resourceMetrics = metricsData.resourceMetrics;
  if (!resourceMetrics || resourceMetrics.length === 0) return [];

  const scopeMetrics = resourceMetrics[0].scopeMetrics;
  if (!scopeMetrics || scopeMetrics.length === 0) return [];

  const metrics = scopeMetrics[0].metrics;
  if (!metrics) return [];

  const foundRoutes = [];

  for (const metric of metrics) {
    if (metric.name !== 'httpServerRequestDuration') continue;
    if (metric.data !== 'exponentialHistogram') continue;

    const dataPoints = metric.exponentialHistogram.dataPoints;
    validateArray(dataPoints, 'dataPoints');

    for (const dp of dataPoints) {
      const count = parseInt(dp.count, 10);
      if (count === 0) continue;

      // Check for http.route attribute
      const routeAttr = getAttr(dp.attributes, 'http.route');
      if (routeAttr) {
        const routeValue = routeAttr.value.stringValue;
        console.log(`Found route: ${routeValue} (count: ${count})`);
        if (expectedRoutes.has(routeValue) && !foundRoutes.includes(routeValue)) {
          foundRoutes.push(routeValue);
        }
      }
    }
  }

  return foundRoutes;
}

async function runTest() {
  // Start gRPC server as child process
  const grpcServer = new GRPCServer();

  const grpcPort = await new Promise((resolve, reject) => {
    grpcServer.start(mustSucceed((port) => {
      console.log('gRPC server started on port', port);
      resolve(port);
    }));
  });

  // Configure NSolid to connect to our gRPC server
  process.env.NSOLID_GRPC_INSECURE = '1';
  process.env.NODE_DEBUG_NATIVE = 'nsolid_grpc_agent';

  // Initialize NSolid
  nsolid.start({ grpc: `localhost:${grpcPort}`, interval: 500 });

  // Create Express server with multiple routes
  const app = express();

  app.get('/users/:id', (req, res) => {
    res.json({ userId: req.params.id });
  });

  app.get('/posts/:postId', (req, res) => {
    res.json({ postId: req.params.postId });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Track connections for forceful close
  const connections = new Set();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => {
      console.log('Express server started on port', s.address().port);
      resolve(s);
    });
    s.on('connection', (conn) => {
      connections.add(conn);
      conn.on('close', () => connections.delete(conn));
    });
  });

  const serverPort = server.address().port;

  // Track which routes we've seen
  const expectedRoutes = new Set(['/users/:id', '/posts/:postId', '/health']);
  const foundRoutes = new Set();

  // Listen for metrics
  const metricsPromise = new Promise((resolve, reject) => {
    grpcServer.on('metrics', (data) => {
      const found = checkHttpRouteAttribute(data, expectedRoutes);
      for (const route of found) {
        if (!foundRoutes.has(route)) {
          foundRoutes.add(route);
          console.log(`Validated route: ${route} (${foundRoutes.size}/${expectedRoutes.size})`);
        }
      }

      if (foundRoutes.size === expectedRoutes.size) {
        console.log('All routes validated!');
        resolve();
      }
    });
  });

  // Make HTTP requests to trigger routes
  console.log('Making HTTP requests...');

  // Request to /users/:id
  let response = await fetch(`http://127.0.0.1:${serverPort}/users/123`);
  assert.strictEqual(response.status, 200);
  console.log('Requested /users/123');

  // Request to /posts/:postId
  response = await fetch(`http://127.0.0.1:${serverPort}/posts/456`);
  assert.strictEqual(response.status, 200);
  console.log('Requested /posts/456');

  // Request to /health
  response = await fetch(`http://127.0.0.1:${serverPort}/health`);
  assert.strictEqual(response.status, 200);
  console.log('Requested /health');

  // Wait for all metrics to be reported
  await metricsPromise;

  // Cleanup
  console.log('Cleaning up...');
  for (const conn of connections) {
    conn.destroy();
  }

  await new Promise((resolve) => {
    server.close(() => {
      grpcServer.close();
      resolve();
    });
  });
}

await runTest();
console.log('Express v5 route test passed!');
