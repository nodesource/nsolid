import assert from 'node:assert';
import path from 'node:path';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const metricsServiceProtoPath = 'opentelemetry/proto/collector/metrics/v1/metrics_service.proto';
const traceServiceProtoPath = 'opentelemetry/proto/collector/trace/v1/trace_service.proto';
const serviceProtoPath = 'nsolid_service.proto';
const includeDirs = [path.resolve(import.meta.dirname,
                                  '../../../deps/opentelemetry-cpp/third_party/opentelemetry-proto'),
                     path.resolve(import.meta.dirname,
                                  '../../../agents/grpc/proto')];

const commandCallMap = new Map();

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

  const packageDefinition = await protoLoader.load(serviceProtoPath, opts);
  const packageObject = grpc.loadPackageDefinition(packageDefinition);
  server.addService(packageObject.grpcagent.NSolidService.service, {
    Command: async (call) => {
      // The 1st time this is called is because the Command rpc is up.
      // get the agentId from the metadata and store the call object in a map
      // so we can use it later to send commands to that specific agent
      const agentId = call.metadata.get('nsolid-agent-id')[0];
      commandCallMap.set(agentId, call);
      call.on('end', () => {
        console.log('end');
        // The client has finished sending
        // You can end the call here
        call.end();
        commandCallMap.delete(agentId);
      });
    },
    ExportAsset: async (call) => {
      console.log('ExportAsset');
      console.dir(call.metadata, { depth: null });
      const asset = {
        common: null,
        threadId: null,
        metadata: null,
        data: '',
      };
      call._my_data = '';
      call.on('data', (data) => {
        console.log('[ExportAsset] data', data.data.length);
        asset.common = data.common;
        asset.threadId = data.threadId;
        asset.metadata = data.metadata;
        asset.data += data.data;
      });
      call.on('error', (err) => {
        console.error('[ExportAsset] error', err);
      });
      call.on('end', () => {
        call.end();
        process.send({ type: asset.common.command, data: { msg: asset, metadata: call.metadata }});
      });
    },
    ExportBlockedLoop: (call, callback) => {
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      callback(null, {});
      process.send({ type: 'loop_blocked', data: { msg: call.request, metadata: call.metadata }});
    },
    ExportCommandError: (call, callback) => {
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      callback(null, {});
    },
    ExportExit: (call, callback) => {
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      callback(null, {});
      process.send({ type: 'exit', data: { msg: call.request, metadata: call.metadata }});
    },
    ExportInfo: (call, callback) => {
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      callback(null, {});
      process.send({ type: 'info', data: { msg: call.request, metadata: call.metadata }});
    },
    ExportMetrics: (call, callback) => {
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      callback(null, {});
      process.send({ type: 'metrics', data: { msg: call.request, metadata: call.metadata }});
    },
    ExportPackages: (call, callback) => {
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      callback(null, {});
      process.send({ type: 'packages', data: { msg: call.request, metadata: call.metadata }});
    },
    ExportReconfigure: (call, callback) => {
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      callback(null, {});
    },
    ExportStartupTimes: (call, callback) => {
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      callback(null, {});
      process.send({ type: 'startup_times', data: { msg: call.request, metadata: call.metadata }});
    },
    ExportUnblockedLoop: (call, callback) => {
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      callback(null, {});
      process.send({ type: 'loop_unblocked', data: { msg: call.request, metadata: call.metadata }});
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
  if (message.type === 'profile') {
    sendCpuProfile(message.agentId, message.requestId, message.options);
  } else if (message.type === 'heap_profile') {
    sendHeapProfile(message.agentId, message.requestId, message.options);
  } else if (message.type === 'heap_sampling') {
    sendHeapSampling(message.agentId, message.requestId, message.options);
  } else if (message.type === 'info') {
    sendInfo(message.agentId, message.requestId);
  } else if (message.type === 'metrics') {
    sendMetrics(message.agentId, message.requestId);
  } else if (message.type === 'packages') {
    sendPackages(message.agentId, message.requestId);
  } else if (message.type === 'snapshot') {
    sendHeapSnapshot(message.agentId, message.requestId, message.options);
  } else if (message.type === 'startup_times') {
    sendStartupTimes(message.agentId, message.requestId);
  } else if (message.type === 'close') {
    server.forceShutdown();
    process.exit(0);
  }
});

async function sendCommand(command, agentId, requestId, args = {}) {
  return new Promise((resolve, reject) => {
    const call = commandCallMap.get(agentId);
    if (!call) {
      reject(new Error(`No call object found for agentId ${agentId}`));
    }

    const req = {
      requestId,
      id: agentId,
      command,
      args
    };

    console.log("Sending command", req);

    call.write(req);
    call.once('data', (runtimeResponse) => {
      console.log(`${command} response`, runtimeResponse);
      resolve();
    });
  });
}

async function sendCpuProfile(agentId, requestId, options) {
  const args = {
    profile: options
  }
  return sendCommand('profile', agentId, requestId, args);
}

async function sendHeapProfile(agentId, requestId, options) {
  const args = {
    profile: options
  }
  return sendCommand('heap_profile', agentId, requestId, args);
}

async function sendHeapSampling(agentId, requestId, options) {
  const args = {
    profile: options
  }
  return sendCommand('heap_sampling', agentId, requestId, args);
}

async function sendHeapSnapshot(agentId, requestId, options) {
  const args = {
    profile: options
  }
  return sendCommand('snapshot', agentId, requestId, args);
}

async function sendInfo(agentId, requestId) {
  return sendCommand('info', agentId, requestId);
}

async function sendMetrics(agentId, requestId) {
  return sendCommand('metrics', agentId, requestId);
}

async function sendPackages(agentId, requestId) {
  return sendCommand('packages', agentId, requestId);
}

async function sendStartupTimes(agentId, requestId) {
  return sendCommand('startup_times', agentId, requestId);
}
