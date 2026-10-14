import path from 'node:path';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

export const status = grpc.status;

export async function startCommandBackoffServer(code) {
  const definition = await protoLoader.load('nsolid_service.proto', {
    includeDirs: [
      path.resolve(import.meta.dirname, '../../../agents/grpc/proto'),
      path.resolve(import.meta.dirname,
                   '../../../deps/opentelemetry-cpp/third_party/opentelemetry-proto'),
    ],
  });
  const { grpcagent } = grpc.loadPackageDefinition(definition);
  const server = new grpc.Server();
  const times = [];
  let complete;
  const attempts = new Promise((resolve) => { complete = resolve; });
  server.addService(grpcagent.NSolidService.service, {
    Command(call) {
      times.push(performance.now());
      console.log(`Command close status=${code}, attempt=${times.length}`);
      call.on('error', () => {});
      if (code === grpc.status.OK) call.end();
      else call.emit('error', { code, details: 'retry test' });
      if (times.length === 3) complete();
    },
  });
  const port = await new Promise((resolve, reject) => {
    server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(),
                     (err, port) => (err ? reject(err) : resolve(port)));
  });
  return { server, times, attempts, port };
}
