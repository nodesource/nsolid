import assert from 'node:assert';
import path from 'node:path';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const metricsServiceProtoPath = 'opentelemetry/proto/collector/metrics/v1/metrics_service.proto';
const traceServiceProtoPath = 'opentelemetry/proto/collector/trace/v1/trace_service.proto';
const includeDirs = [path.resolve(import.meta.dirname,
                                  '../../../deps/opentelemetry-cpp/third_party/opentelemetry-proto')];

// Create a local server to receive data from
async function startServer(cb) {
  const server = new grpc.Server();
  const opts = {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs,
  };

  const packageDefinitionMetrics = await protoLoader.load(metricsServiceProtoPath, opts);
  const packageObjectMetrics = grpc.loadPackageDefinition(packageDefinitionMetrics);
  server.addService(packageObjectMetrics.opentelemetry.proto.collector.metrics.v1.MetricsService.service, {
    Export: (data, callback) => {
      // console.dir(data, { depth: null });
      console.log('Metrics received');
      callback(null, { message: 'Metrics received' });
      cb(null, 'metrics', data.request);
    },
  });

  const packageDefinitionTrace = await protoLoader.load(traceServiceProtoPath, opts);
  const packageObjectTrace = grpc.loadPackageDefinition(packageDefinitionTrace);
  server.addService(packageObjectTrace.opentelemetry.proto.collector.trace.v1.TraceService.service, {
    Export: (data, callback) => {
      callback(null, { message: 'Trace received' });
      cb(null, 'spans', data.request);
    },
  });

  const credentials = grpc.ServerCredentials.createInsecure();
  return new Promise((resolve, reject) => {
    server.bindAsync('localhost:0', credentials, (err, port) => {
      server.start();
      resolve({ server, port });
    });
  });
}

const { server, port } = await startServer((err, type, data) => {
  assert.ifError(err);
  process.send({ type, data });
});

process.send({ type: 'port', port });
process.on('message', (message) => {
  if (message.type === 'close') {
    server.forceShutdown();
    process.exit(0);
  }
});
