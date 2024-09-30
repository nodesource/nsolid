// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import validators from 'internal/validators';
import {
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';

const {
  validateArray,
  validateObject,
  validateString,
} = validators;


//  Data has this format:
// {
//   body: {
//     bootstrap_complete: '313146856115262',
//     customTime: '313146885991353',
//     initialized_v8: '313146837854491',
//     initialized_node: '313146834815131',
//     timeOrigin: '313146834251040',
//     timeOriginTimestamp: '1727688108538266',
//     loaded_environment: '313146845566599',
//     loop_start: '313146866022631'
//   },
//   common: {
//     requestId: 'ef237de0-ab80-413a-a106-3b0aee1e183e',
//     command: 'startup_times',
//     recorded: { seconds: '1727688108', nanoseconds: '595667430' },
//     error: null
//   }
// }
// Metadata {
//   internalRepr: Map(2) {
//     'user-agent' => [ 'grpc-c++/1.65.2 grpc-c/42.0.0 (linux; chttp2)' ],
//     'nsolid-agent-id' => [ '33ab125bff8a1b006bee8f99792c9700673c7df2' ]
//   },
//   options: {}
// }

function checkStartupTimesData(startup, metadata, requestId, agentId, additionalTimes = []) {
  console.dir(startup, { depth: null });
  assert.strictEqual(startup.common.requestId, requestId);
  assert.strictEqual(startup.common.command, 'startup_times');
  // From here check at least that all the fields are present
  validateObject(startup.common.recorded, 'recorded');
  const recSeconds = BigInt(startup.common.recorded.seconds);
  assert.ok(recSeconds);
  const recNanoSecs = BigInt(startup.common.recorded.nanoseconds);
  assert.ok(recNanoSecs);
  validateObject(startup.body, 'body');
  // Also the body fields
  assert.ok(startup.body.initialized_node);
  assert.ok(startup.body.initialized_v8);
  assert.ok(startup.body.loaded_environment);
  assert.ok(startup.body.loop_start);
  assert.ok(startup.body.timeOrigin);
  additionalTimes.forEach((time) => assert.ok(startup.body[time]));
  Object.keys(startup.body).forEach((key) => {
    assert.ok(BigInt(startup.body[key]));
  });

  validateArray(metadata['user-agent'], 'metadata.user-agent');
  validateString(metadata['user-agent'][0], 'metadata.user-agent[0]');
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);
}

const tests = [];

tests.push({
  name: 'should work with the default values',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`,
          NSOLID_BLOCKED_LOOP_THRESHOLD: 100
        };

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        const { data, requestId } = await grpcServer.startupTimes(agentId);
        checkStartupTimesData(data.msg, data.metadata, requestId, agentId);
        await child.shutdown(0);
        grpcServer.close();
        resolve();
      }));
    });
  }
});

tests.push({
  name: 'should work with the custom times',
  test: async () => {
    return new Promise((resolve) => {
      const grpcServer = new GRPCServer();
      grpcServer.start(mustSucceed(async (port) => {
        const env = {
          NODE_DEBUG_NATIVE: 'nsolid_grpc_agent',
          NSOLID_GRPC_INSECURE: 1,
          NSOLID_GRPC: `localhost:${port}`,
          NSOLID_BLOCKED_LOOP_THRESHOLD: 100
        };

        const opts = {
          stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
          env,
        };
        const child = new TestClient([], opts);
        const agentId = await child.id();
        assert.ok(await child.startupTimes('customTime'));
        const { data, requestId } = await grpcServer.startupTimes(agentId);
        checkStartupTimesData(data.msg, data.metadata, requestId, agentId, [ 'customTime' ]);
        await child.shutdown(0);
        grpcServer.close();
        resolve();
      }));
    });
  }
});

for (const { name, test } of tests) {
  console.log(`[startup times] ${name}`);
  await test();
}
