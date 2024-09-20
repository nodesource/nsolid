import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import { TestPlayground } from '../common/nsolid-zmq-agent/index.js';

// Data has this format:
// {
//   agentId: 'd0cd9326d8bc07009f7bb5e9aa123b001ce85c56',
//   requestId: 'd1bc1c33-1239-4322-bdf2-986b9aa5c683',
//   command: 'packages',
//   recorded: { seconds: 1704736859, nanoseconds: 511473832 },
//   duration: 0,
//   interval: 3000,
//   version: 4,
// body: {
//   packages: [
//     {
//       path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-zmq-agent/node_modules/base64-js',
//       name: 'base64-js',
//       version: '1.5.1',
//       main: 'index.js',
//       dependencies: [],
//       required: false
//     },
//     {
//       path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-zmq-agent/node_modules/base85',
//       name: 'base85',
//       version: '3.1.0',
//       main: 'lib/base85.js',
//       dependencies: [ '../buffer', '../ip-address', '../underscore' ],
//       required: false
//     },
//     {
//       path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-zmq-agent/node_modules/buffer',
//       name: 'buffer',
//       version: '6.0.3',
//       main: 'index.js',
//       dependencies: [ '../base64-js', '../ieee754' ],
//       required: false
//     },
//     {
//       path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-zmq-agent/node_modules/ieee754',
//       name: 'ieee754',
//       version: '1.2.1',
//       main: 'index.js',
//       dependencies: [],
//       required: false
//     },
//     {
//       path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-zmq-agent/node_modules/ip-address',
//       name: 'ip-address',
//       version: '5.9.4',
//       main: 'ip-address.js',
//       dependencies: [ '../jsbn', '../lodash', '../sprintf-js' ],
//       required: false
//     },
//     {
//       path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-zmq-agent/node_modules/jsbn',
//       name: 'jsbn',
//       version: '1.1.0',
//       main: 'index.js',
//       dependencies: [],
//       required: false
//     },
//     {
//       path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-zmq-agent/node_modules/lodash',
//       name: 'lodash',
//       version: '4.17.21',
//       main: 'lodash.js',
//       dependencies: [],
//       required: false
//     },
//     {
//       path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-zmq-agent/node_modules/nan',
//       name: 'nan',
//       version: '2.17.0',
//       main: 'include_dirs.js',
//       dependencies: [],
//       required: false
//     },
//     {
//       path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-zmq-agent/node_modules/node-gyp-build',
//       name: 'node-gyp-build',
//       version: '4.8.0',
//       main: 'index.js',
//       dependencies: [],
//       required: false
//     },
//     {
//       path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-zmq-agent/node_modules/sprintf-js',
//       name: 'sprintf-js',
//       version: '1.1.2',
//       main: 'src/sprintf.js',
//       dependencies: [],
//       required: false
//     },
//     {
//       path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-zmq-agent/node_modules/underscore',
//       name: 'underscore',
//       version: '1.13.6',
//       main: 'underscore-umd.js',
//       dependencies: [],
//       required: false
//     },
//     {
//       path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-zmq-agent/node_modules/zeromq',
//       name: 'zeromq',
//       version: '5.3.1',
//       main: 'index',
//       dependencies: [ '../nan', '../node-gyp-build' ],
//       required: false
//     }
//   ]
// },
//   time: 1704736859511,
//   timeNS: '1704736859511473832'
// }

const expectedPackageNames = [
  'base64-js', 'base85', 'buffer', 'ieee754', 'ip-address', 'jsbn', 'lodash',
  'nan', 'node-gyp-build', 'sprintf-js', 'underscore', 'zeromq',
];

const expectedPackagesMajorVersions = ['1', '3', '6', '1', '5', '1', '4', '2', '4', '1', '1', '5'];
const expectedPackagesMains = [
  'index.js', 'lib/base85.js', 'index.js', 'index.js', 'ip-address.js', 'index.js', 'lodash.js',
  'include_dirs.js', 'index.js', 'src/sprintf.js', 'underscore-umd.js', 'index',
];

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

  assert.ok(packages.body.packages.every(
    e => expectedPackageNames.includes(e.name)));
  if (packages.body.packages.length < expectedPackageNames.length) {
    return false;
  }

  const packagesNames = packages.body.packages.map((pkg) => pkg.name);
  assertIncludes(packagesNames, expectedPackageNames);

  const packagesMajorVersions = packages.body.packages.map((pkg) => pkg.version.split('.')[0]);
  assertIncludes(packagesMajorVersions, expectedPackagesMajorVersions);

  const packagesMains = packages.body.packages.map((pkg) => pkg.main);
  assertIncludes(packagesMains, expectedPackagesMains);

  return true;
}

function assertIncludes(actualValues, expectedValues) {
  for (const expectedValue of expectedValues) {
    assert.ok(actualValues.includes(expectedValue));
  }
}

async function agentPackagesRequest(playground, agentId) {
  return new Promise((resolve) => {
    const requestId = playground.zmqAgentBus.agentPackagesRequest(agentId, mustSucceed((packages) => {
      resolve({ requestId, packages });
    }));
  });
}

const tests = [];

tests.push({
  name: 'should provide default values correctly',
  test: async (playground) => {
    return new Promise((resolve) => {
      playground.bootstrap(mustSucceed(async (agentId) => {
        // Call agentPackagesRequest until checkPackagesData returns true
        let packages;
        let requestId;
        do {
          const data = await agentPackagesRequest(playground, agentId);
          packages = data.packages;
          requestId = data.requestId;
        } while (checkPackagesData(packages, requestId, agentId) === false);
        resolve();
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


for (const saas of [false, true]) {
  config.saas = saas;
  const label = saas ? 'saas' : 'local';
  const playground = new TestPlayground(config);
  await playground.startServer();

  for (const { name, test } of tests) {
    console.log(`[${label}] packages command ${name}`);
    await test(playground);
    await playground.stopClient();
  }

  await playground.stopServer();
}
