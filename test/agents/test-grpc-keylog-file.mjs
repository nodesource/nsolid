// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import fixtures from '../common/fixtures.js';
import fs from 'node:fs';
import {
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

async function runTest({ getEnv, nsolidConfig }) {
  return new Promise((resolve, reject) => {
    const grpcServer = new GRPCServer({ tls: true });
    grpcServer.start(mustSucceed(async (port) => {
      console.log('GRPC server started', port);
      const env = getEnv(port);
      const opts = {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env,
      };
      const child = new TestClient([], opts);
      // Make sure grpc connections are up
      await child.id();
      // Check keylog file exists
      const keylogFile = `./nsolid-tls-keylog-${child.child().pid}.log`;
      // Should throw if file does not exist
      fs.unlinkSync(keylogFile);
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
        NSOLID_GRPC: `localhost:${port}`,
        NSOLID_GRPC_CERTS: fixtures.path('keys', 'selfsigned-no-keycertsign', 'cert.pem'),
        NSOLID_GRPC_KEYLOG: '1',
      };
    },
  },
];

for (const testConfig of testConfigs) {
  await runTest(testConfig);
  console.log('run test!');
}
