// Flags: --expose-internals
import { mustCallAtLeast, mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import {
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

// The Console can end the command stream while the agent still has commands
// to acknowledge. The agent must not write to the finished stream: it has to
// stay up and open a new command stream each time.
//
// A large burst makes the agent try to write after it has finished writing.
// A smaller one can make it write after gRPC has destroyed the stream.
const bursts = [300, 50];

const grpcServer = new GRPCServer();
grpcServer.start(mustSucceed(async (port) => {
  const env = {
    NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
    NSOLID_GRPC_INSECURE: 1,
    NSOLID_GRPC: `localhost:${port}`,
  };

  let streams = 0;
  grpcServer.on('command', mustCallAtLeast(async ({ agentId }) => {
    const burst = bursts[streams++];
    if (burst !== undefined) {
      grpcServer.endCommandStream(agentId, burst);
      return;
    }

    if (streams === bursts.length + 1) {
      // The agent survived every burst and reconnected.
      const exit = await child.shutdown(0);
      assert.strictEqual(exit.code, 0);
      assert.strictEqual(exit.signal, null);
      grpcServer.close();
    }
  }, bursts.length + 1));

  const child = new TestClient([], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env,
  });
}));
