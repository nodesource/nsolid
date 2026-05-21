import assert from 'node:assert';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

import fixtures from '../fixtures.js';

const options = {
  tls: {
    type: 'boolean',
    default: false,
  },
};

const args = parseArgs({ options });

const logsServiceProtoPath = 'opentelemetry/proto/collector/logs/v1/logs_service.proto';
const metricsServiceProtoPath = 'opentelemetry/proto/collector/metrics/v1/metrics_service.proto';
const traceServiceProtoPath = 'opentelemetry/proto/collector/trace/v1/trace_service.proto';
const serviceProtoPath = 'nsolid_service.proto';
const includeDirs = [path.resolve(import.meta.dirname,
                                  '../../../deps/opentelemetry-cpp/third_party/opentelemetry-proto'),
                     path.resolve(import.meta.dirname,
                                  '../../../agents/grpc/proto')];

const commandCallMap = new Map();

// Fault injection state
const faultInjections = new Map(); // service -> { status, remaining }
const delayInjections = new Map(); // service -> delayMs
const serviceAttempts = new Map(); // service -> { total, lastPreviousRpcAttempts }

function getPreviousRpcAttempts(metadata) {
  const attempts = metadata?.get('grpc-previous-rpc-attempts');
  if (!attempts || attempts.length === 0) {
    return 0;
  }

  return Number(attempts[0]) || 0;
}

function recordAttempt(serviceName, metadata) {
  const total = (serviceAttempts.get(serviceName)?.total || 0) + 1;
  const lastPreviousRpcAttempts = getPreviousRpcAttempts(metadata);
  serviceAttempts.set(serviceName, { total, lastPreviousRpcAttempts });
}

// Helper to check and inject fault for unary calls
function checkAndInjectFault(serviceName, callback) {
  const fault = faultInjections.get(serviceName);
  if (fault && fault.remaining > 0) {
    fault.remaining--;
    const status = grpc.status[fault.status] || grpc.status.UNAVAILABLE;
    console.log(`Injecting fault for ${serviceName}`, { code: status, message: `Injected fault: ${fault.status}` });
    callback({ code: status, message: `Injected fault: ${fault.status}` });
    return true;
  }
  return false;
}

// Helper to check and inject fault for streaming calls
function checkAndInjectFaultStreaming(serviceName, call) {
  const fault = faultInjections.get(serviceName);
  if (fault && fault.remaining > 0) {
    fault.remaining--;
    const status = grpc.status[fault.status] || grpc.status.UNAVAILABLE;
    call.destroy({ code: status, message: `Injected fault: ${fault.status}` });
    return true;
  }
  return false;
}

// Helper to inject delay for unary calls
async function injectDelay(serviceName, callback) {
  const delay = delayInjections.get(serviceName);
  if (delay) {
    await setTimeout(delay);
  }
  callback();
}

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

  const packageDefinitionLogs = await protoLoader.load(logsServiceProtoPath, opts);
  const packageObjectLogs = grpc.loadPackageDefinition(packageDefinitionLogs);
  server.addService(packageObjectLogs.opentelemetry.proto.collector.logs.v1.LogsService.service, {
    Export: (data, callback) => {
      recordAttempt('ExportLogs', data.metadata);
      console.dir(data.request, { depth: null });
      // console.log('Logs received');
      if (checkAndInjectFault('ExportLogs', callback)) return;
      injectDelay('ExportLogs', () => {
        callback(null, { message: 'Logs received' });
        cb(null, 'logs', data.request);
      });
    },
  });

  const packageDefinitionMetrics = await protoLoader.load(metricsServiceProtoPath, opts);
  const packageObjectMetrics = grpc.loadPackageDefinition(packageDefinitionMetrics);
  server.addService(packageObjectMetrics.opentelemetry.proto.collector.metrics.v1.MetricsService.service, {
    Export: (data, callback) => {
      recordAttempt('ExportMetrics', data.metadata);
      // console.dir(data, { depth: null });
      console.log('Metrics received');
      if (checkAndInjectFault('ExportMetrics', callback)) return;
      injectDelay('ExportMetrics', () => {
        callback(null, { message: 'Metrics received' });
        console.dir(data.metadata, { depth: null });
        cb(null, 'metrics', { request: data.request, metadata: data.metadata });
      });
    },
  });

  const packageDefinitionTrace = await protoLoader.load(traceServiceProtoPath, opts);
  const packageObjectTrace = grpc.loadPackageDefinition(packageDefinitionTrace);
  server.addService(packageObjectTrace.opentelemetry.proto.collector.trace.v1.TraceService.service, {
    Export: (data, callback) => {
      recordAttempt('ExportSpans', data.metadata);
      if (checkAndInjectFault('ExportSpans', callback)) return;
      injectDelay('ExportSpans', () => {
        callback(null, { message: 'Trace received' });
        cb(null, 'spans', { request: data.request, metadata: data.metadata });
      });
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

      process.send({ type: 'command', data: { agentId } });
    },
    ExportAsset: async (call) => {
      console.log('ExportAsset');
      console.dir(call.metadata, { depth: null });
      if (checkAndInjectFaultStreaming('ExportAsset', call)) return;
      const asset = {
        common: null,
        threadId: null,
        metadata: null,
        data: '',
        duration: null,
      };
      call._my_data = '';
      call.on('data', (data) => {
        console.log('[ExportAsset] data', data.data.length);
        asset.common = data.common;
        asset.threadId = data.threadId;
        asset.metadata = data.metadata;
        asset.data += data.data;
        if (data.complete) {
          asset.duration = data.duration;
        }
      });
      call.on('error', (err) => {
        console.error('[ExportAsset] error', err);
      });
      call.on('end', () => {
        call.end();
        process.send({ type: asset.common.command,
                       data: { msg: asset, metadata: call.metadata } });
      });
    },
    ExportBlockedLoop: (call, callback) => {
      recordAttempt('ExportBlockedLoop', call.metadata);
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      if (checkAndInjectFault('ExportBlockedLoop', callback)) return;
      injectDelay('ExportBlockedLoop', () => {
        callback(null, {});
        process.send({ type: 'loop_blocked',
                       data: { msg: call.request, metadata: call.metadata } });
      });
    },
    ExportCommandError: (call, callback) => {
      recordAttempt('ExportCommandError', call.metadata);
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      if (checkAndInjectFault('ExportCommandError', callback)) return;
      injectDelay('ExportCommandError', () => {
        callback(null, {});
      });
    },
    ExportContinuousProfile: async (call) => {
      recordAttempt('ExportContinuousProfile', call.metadata);
      console.log('ExportContinuousProfile');
      console.dir(call.metadata, { depth: null });
      if (checkAndInjectFaultStreaming('ExportContinuousProfile', call)) return;
      const asset = {
        common: null,
        threadId: null,
        metadata: null,
        data: '',
        duration: null,
        startTs: null,
        endTs: null,
      };
      call.on('data', (data) => {
        console.log('[ExportContinuousProfile] data', data.data.length);
        asset.common = data.common;
        asset.threadId = data.threadId;
        asset.metadata = data.metadata;
        asset.data += data.data;
        if (data.complete) {
          asset.duration = data.duration;
          asset.startTs = data.startTs;
          asset.endTs = data.endTs;
        }
      });
      call.on('error', (err) => {
        console.error('[ExportContinuousProfile] error', err);
      });
      call.on('end', () => {
        call.end();
        process.send({ type: asset.common.command,
                       data: { msg: asset, metadata: call.metadata, continuous: true } });
      });
    },
    ExportExit: (call, callback) => {
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      recordAttempt('ExportExit', call.metadata);
      if (checkAndInjectFault('ExportExit', callback)) return;
      injectDelay('ExportExit', () => {
        callback(null, {});
        process.send({ type: 'exit', data: { msg: call.request, metadata: call.metadata } });
      });
    },
    ExportInfo: (call, callback) => {
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      recordAttempt('ExportInfo', call.metadata);
      if (checkAndInjectFault('ExportInfo', callback)) return;
      injectDelay('ExportInfo', () => {
        callback(null, {});
        process.send({ type: 'info', data: { msg: call.request, metadata: call.metadata } });
      });
    },
    ExportMetrics: (call, callback) => {
      // Extract data from the request object
      //  console.dir(call.request, { depth: null });
      //  console.dir(call.metadata, { depth: null });
      recordAttempt('ExportMetricsCmd', call.metadata);
      if (checkAndInjectFault('ExportMetricsCmd', callback)) return;
      injectDelay('ExportMetricsCmd', () => {
        callback(null, {});
        process.send({ type: 'metrics_cmd', data: { msg: call.request, metadata: call.metadata } });
      });
    },
    ExportPackages: (call, callback) => {
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      recordAttempt('ExportPackages', call.metadata);
      if (checkAndInjectFault('ExportPackages', callback)) return;
      injectDelay('ExportPackages', () => {
        callback(null, {});
        process.send({ type: 'packages', data: { msg: call.request, metadata: call.metadata } });
      });
    },
    ExportReconfigure: (call, callback) => {
      // Extract data from the request object
      recordAttempt('ExportReconfigure', call.metadata);
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      if (checkAndInjectFault('ExportReconfigure', callback)) return;
      injectDelay('ExportReconfigure', () => {
        callback(null, {});
        process.send({ type: 'reconfigure', data: { msg: call.request, metadata: call.metadata } });
      });
    },
    ExportSourceCode: (call, callback) => {
      // Extract data from the request object
      recordAttempt('ExportSourceCode', call.metadata);
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      if (checkAndInjectFault('ExportSourceCode', callback)) return;
      injectDelay('ExportSourceCode', () => {
        callback(null, {});
        process.send({ type: 'source_code', data: { msg: call.request, metadata: call.metadata } });
      });
    },
    ExportStartupTimes: (call, callback) => {
      // Extract data from the request object
      recordAttempt('ExportStartupTimes', call.metadata);
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      if (checkAndInjectFault('ExportStartupTimes', callback)) return;
      injectDelay('ExportStartupTimes', () => {
        callback(null, {});
        process.send({ type: 'startup_times', data: { msg: call.request, metadata: call.metadata } });
      });
    },
    ExportUnblockedLoop: (call, callback) => {
      // Extract data from the request object
      console.dir(call.request, { depth: null });
      console.dir(call.metadata, { depth: null });
      recordAttempt('ExportUnblockedLoop', call.metadata);
      if (checkAndInjectFault('ExportUnblockedLoop', callback)) return;
      injectDelay('ExportUnblockedLoop', () => {
        callback(null, {});
        process.send({ type: 'loop_unblocked', data: { msg: call.request, metadata: call.metadata } });
      });
    },
  });

  let credentials;
  if (args.values.tls) {
    const key =
      fixtures.readKey(path.join('selfsigned-no-keycertsign', 'key.pem'));
    const cert =
      fixtures.readKey(path.join('selfsigned-no-keycertsign', 'cert.pem'));
    credentials = grpc.ServerCredentials.createSsl(null, [{
      cert_chain: cert,
      private_key: key,
    }], false); // False means no client-side authentication
  } else {
    credentials = grpc.ServerCredentials.createInsecure();
  }

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
  } else if (message.type === 'reconfigure') {
    sendReconfigure(message.agentId, message.requestId, message.config);
  } else if (message.type === 'snapshot') {
    sendHeapSnapshot(message.agentId, message.requestId, message.options);
  } else if (message.type === 'source_code') {
    sendSourceCode(message.agentId, message.requestId, message.options);
  } else if (message.type === 'startup_times') {
    sendStartupTimes(message.agentId, message.requestId);
  } else if (message.type === 'inject_failure') {
    // Inject failure for a service: { service, status, count }
    faultInjections.set(message.service, { status: message.status || 'UNAVAILABLE', remaining: message.count || 1 });
  } else if (message.type === 'inject_delay') {
    // Inject delay for a service: { service, delay }
    delayInjections.set(message.service, message.delay || 0);
  } else if (message.type === 'get_attempts') {
    process.send({
      type: 'attempts',
      data: {
        service: message.service,
        total: serviceAttempts.get(message.service)?.total || 0,
        lastPreviousRpcAttempts:
          serviceAttempts.get(message.service)?.lastPreviousRpcAttempts || 0,
      },
    });
  } else if (message.type === 'clear_faults') {
    faultInjections.clear();
    delayInjections.clear();
    serviceAttempts.clear();
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
      args,
    };

    call.write(req);
    call.once('data', (runtimeResponse) => {
      console.log(`${command} response`, runtimeResponse);
      resolve();
    });
  });
}

async function sendCpuProfile(agentId, requestId, options) {
  const args = {
    profile: options,
  };

  return sendCommand('profile', agentId, requestId, args);
}

async function sendHeapProfile(agentId, requestId, options) {
  const args = {
    profile: options,
  };

  return sendCommand('heap_profile', agentId, requestId, args);
}

async function sendHeapSampling(agentId, requestId, options) {
  const args = {
    profile: options,
  };

  return sendCommand('heap_sampling', agentId, requestId, args);
}

async function sendHeapSnapshot(agentId, requestId, options) {
  const args = {
    profile: options,
  };

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

async function sendReconfigure(agentId, requestId, reconfigure) {
  const args = {
    reconfigure,
  };

  return sendCommand('reconfigure', agentId, requestId, args);
}

async function sendSourceCode(agentId, requestId, options) {
  const args = {
    sourceCode: options,
  };

  return sendCommand('source_code', agentId, requestId, args);
}

async function sendStartupTimes(agentId, requestId) {
  return sendCommand('startup_times', agentId, requestId);
}
