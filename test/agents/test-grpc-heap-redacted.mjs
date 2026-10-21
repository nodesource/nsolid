// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { GRPCServer, TestClient } from '../common/nsolid-grpc-agent/index.js';

function checkRedacted(data, redacted) {
  const { snapshot, nodes, strings } = JSON.parse(data);
  const fields = snapshot.meta.node_fields;
  const typeIndex = fields.indexOf('type');
  const nameIndex = fields.indexOf('name');
  const stringType = snapshot.meta.node_types[typeIndex].indexOf('string');
  let stringCount = 0;
  let redactedCount = 0;
  for (let i = 0; i < nodes.length; i += fields.length) {
    if (nodes[i + typeIndex] === stringType) {
      stringCount++;
      if (strings[nodes[i + nameIndex]] === '(redacted)') {
        redactedCount++;
      }
    }
  }
  assert.ok(stringCount > 0);
  if (redacted) {
    assert.strictEqual(redactedCount, stringCount);
  } else {
    assert.ok(redactedCount < stringCount);
  }
}

const server = new GRPCServer();
server.start(mustSucceed(async (port) => {
  const child = new TestClient([], {
    env: {
      NSOLID_GRPC: `localhost:${port}`,
      NSOLID_GRPC_INSECURE: '1',
    },
  });
  const agentId = await child.id();
  for (const configured of [undefined, false, true]) {
    if (configured !== undefined) {
      await child.config({ redactSnapshots: configured });
    }
    for (const redacted of [false, true]) {
      for (const type of ['heapSnapshot', 'heapProfile']) {
        const { data } = await server[type](agentId, {
          threadId: 0,
          duration: 100,
          [type]: { redacted },
        });
        assert.strictEqual(data.msg.common.error, null);
        checkRedacted(data.msg.data, redacted || configured === true);
      }
    }
  }
  const { code, signal } = await child.shutdown(0);
  assert.strictEqual(code, 0);
  assert.strictEqual(signal, null);
  server.close();
}));
