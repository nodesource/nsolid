import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { TestPlayground } from '../common/nsolid-zmq-agent/index.js';

function assertIncludes(actualValues, expectedValues) {
  for (const expectedValue of expectedValues) {
    assert.ok(actualValues.includes(expectedValue));
  }
}

// Data has this format:
// {
//   agentId: 'd0cd9326d8bc07009f7bb5e9aa123b001ce85c56',
//   requestId: 'd1bc1c33-1239-4322-bdf2-986b9aa5c683',
//   command: 'packages',
//   recorded: { seconds: 1704736859, nanoseconds: 511473832 },
//   duration: 0,
//   interval: 3000,
//   version: 4,
//   body: {
//     packages: [
//       {
//         path: '/path/to/nsolid/test/common/nsolid-zmq-agent/node_modules/debug',
//         name: 'debug',
//         version: '3.1.0',
//         main: './src/index.js',
//         dependencies: [ '../ms' ],
//         required: false
//       },
//       {
//         path: '/path/to/nsolid/test/common/nsolid-zmq-agent/node_modules/ms',
//         name: 'ms',
//         version: '2.0.0',
//         main: './index',
//         dependencies: [],
//         required: false
//       },
//       {
//         path: '/path/to/nsolid/test/common/nsolid-zmq-agent/node_modules/nan',
//         name: 'nan',
//         version: '2.17.0',
//         main: 'include_dirs.js',
//         dependencies: [],
//         required: false
//       },
//       {
//         path: '/path/to/nsolid/test/common/nsolid-zmq-agent/node_modules/node-gyp-build',
//         name: 'node-gyp-build',
//         version: '4.7.1',
//         main: 'index.js',
//         dependencies: [],
//         required: false
//       },
//       {
//         path: '/path/to/nsolid/test/common/nsolid-zmq-agent/node_modules/z85',
//         name: 'z85',
//         version: '0.0.2',
//         main: 'index.js',
//         dependencies: [],
//         required: false
//       },
//       {
//         path: '/path/to/nsolid/test/common/nsolid-zmq-agent/node_modules/zeromq',
//         name: 'zeromq',
//         version: '5.3.1',
//         main: 'index',
//         dependencies: [ '../nan', '../node-gyp-build' ],
//         required: false
//       },
//       {
//         path: '/path/to/nsolid/test/common/nsolid-zmq-agent/node_modules/zmq-zap',
//         name: 'zmq-zap',
//         version: '0.0.3',
//         main: 'index.js',
//         dependencies: [ '../z85', '../debug' ],
//         required: false
//       }
//     ]
//   },
//   time: 1704736859511,
//   timeNS: '1704736859511473832'
// }

function checkPackagesData(packages, requestId, agentId) {
  assert.strictEqual(packages.requestId, requestId);
  assert.strictEqual(packages.agentId, agentId);
  assert.strictEqual(packages.command, 'packages');
  // From here check at least that all the fields are present
  assert.ok(packages.recorded);
  assert.ok(packages.recorded.seconds);
  assert.ok(packages.recorded.nanoseconds);
  assert.ok(packages.duration != null);
  assert.ok(packages.interval);
  assert.ok(packages.version);
  assert.ok(packages.body);
  assert.ok(packages.time);
  // also the body fields
  assert.ok(packages.body.packages);
  assert.ok(packages.body.packages.length);
  for (const pkg of packages.body.packages) {
    assert.ok(pkg.path);
    assert.ok(pkg.name);
    assert.ok(pkg.version);
    assert.ok(pkg.main);
    assert.ok(pkg.dependencies);
    assert.strictEqual(pkg.required, false);
  }

  const packagesNames = packages.body.packages.map((pkg) => pkg.name);
  assertIncludes(packagesNames, ['debug', 'ms', 'nan', 'node-gyp-build', 'z85', 'zeromq', 'zmq-zap']);

  const packagesMajorVersions = packages.body.packages.map((pkg) => pkg.version.split('.')[0]);
  assertIncludes(packagesMajorVersions, ['3', '2', '2', '4', '0', '5', '0']);

  const packagesMains = packages.body.packages.map((pkg) => pkg.main);
  assertIncludes(packagesMains, ['./src/index.js', './index', 'include_dirs.js', 'index.js', 'index']);
}

const tests = [];

tests.push({
  name: 'should provide default values correctly',
  test: async (playground) => {
    return new Promise((resolve) => {
      playground.bootstrap(mustSucceed((agentId) => {
        const requestId = playground.zmqAgentBus.agentPackagesRequest(agentId, mustSucceed((packages) => {
          checkPackagesData(packages, requestId, agentId);
          resolve();
        }));
      }));
    });
  }
});

const config = {
  commandBindAddr: 'tcp://*:9001',
  dataBindAddr: 'tcp://*:9002',
  bulkBindAddr: 'tcp://*:9003',
  HWM: 0,
  bulkHWM: 0,
  commandTimeoutMilliseconds: 5000
};


const playground = new TestPlayground(config);
await playground.startServer();

for (const { name, test } of tests) {
  console.log(`packages command ${name}`);
  await test(playground);
  await playground.stopClient();
}

playground.stopServer();
