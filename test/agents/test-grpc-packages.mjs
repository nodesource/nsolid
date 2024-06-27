// Flags: --expose-internals
import { mustSucceed } from '../common/index.mjs';
import assert from 'node:assert';
import {
  GRPCServer,
  TestClient,
} from '../common/nsolid-grpc-agent/index.js';
import validators from 'internal/validators';

const {
  validateArray,
  validateBoolean,
  validateString,
  validateNumber,
  validateObject,
  validateUint32
} = validators;


// Data has this format:
//   msg: {
//   common: {
//     requestId: '48ecec8f-040d-470d-b471-faafeb941a61',
//     command: 'packages',
//     recorded: { seconds: '1727449806', nanoseconds: '688549177' },
//     error: null
//   },
//   body: {
//     packages: [
//       {
//         dependencies: [ '../proto-loader', '../../@js-sdsl/ordered-map' ],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/@grpc/grpc-js',
//         name: '@grpc/grpc-js',
//         version: '1.11.3',
//         main: 'build/src/index.js',
//         required: false
//       },
//       {
//         dependencies: [
//           '../../lodash.camelcase',
//           '../../long',
//           '../../protobufjs',
//           '../../yargs'
//         ],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/@grpc/proto-loader',
//         name: '@grpc/proto-loader',
//         version: '0.7.13',
//         main: 'build/src/index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/@js-sdsl/ordered-map',
//         name: '@js-sdsl/ordered-map',
//         version: '4.4.2',
//         main: './dist/cjs/index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/@protobufjs/aspromise',
//         name: '@protobufjs/aspromise',
//         version: '1.1.2',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/@protobufjs/base64',
//         name: '@protobufjs/base64',
//         version: '1.1.2',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/@protobufjs/codegen',
//         name: '@protobufjs/codegen',
//         version: '2.0.4',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/@protobufjs/eventemitter',
//         name: '@protobufjs/eventemitter',
//         version: '1.1.0',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [ '../aspromise', '../inquire' ],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/@protobufjs/fetch',
//         name: '@protobufjs/fetch',
//         version: '1.1.0',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/@protobufjs/float',
//         name: '@protobufjs/float',
//         version: '1.0.2',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/@protobufjs/inquire',
//         name: '@protobufjs/inquire',
//         version: '1.1.0',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/@protobufjs/path',
//         name: '@protobufjs/path',
//         version: '1.1.2',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/@protobufjs/pool',
//         name: '@protobufjs/pool',
//         version: '1.1.0',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/@protobufjs/utf8',
//         name: '@protobufjs/utf8',
//         version: '1.1.0',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [ '../../undici-types' ],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/@types/node',
//         name: '@types/node',
//         version: '22.7.3',
//         main: '',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/ansi-regex',
//         name: 'ansi-regex',
//         version: '5.0.1',
//         main: '',
//         required: false
//       },
//       {
//         dependencies: [ '../color-convert' ],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/ansi-styles',
//         name: 'ansi-styles',
//         version: '4.3.0',
//         main: '',
//         required: false
//       },
//       {
//         dependencies: [ '../string-width', '../strip-ansi', '../wrap-ansi' ],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/cliui',
//         name: 'cliui',
//         version: '8.0.1',
//         main: 'build/index.cjs',
//         required: false
//       },
//       {
//         dependencies: [ '../color-name' ],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/color-convert',
//         name: 'color-convert',
//         version: '2.0.1',
//         main: '',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/color-name',
//         name: 'color-name',
//         version: '1.1.4',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/emoji-regex',
//         name: 'emoji-regex',
//         version: '8.0.0',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/escalade',
//         name: 'escalade',
//         version: '3.2.0',
//         main: 'dist/index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/get-caller-file',
//         name: 'get-caller-file',
//         version: '2.0.5',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/is-fullwidth-code-point',
//         name: 'is-fullwidth-code-point',
//         version: '3.0.0',
//         main: '',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/lodash.camelcase',
//         name: 'lodash.camelcase',
//         version: '4.3.0',
//         main: '',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/long',
//         name: 'long',
//         version: '5.2.3',
//         main: 'umd/index.js',
//         required: false
//       },
//       {
//         dependencies: [
//           '../@protobufjs/aspromise',
//           '../@protobufjs/base64',
//           '../@protobufjs/codegen',
//           '../@protobufjs/eventemitter',
//           '../@protobufjs/fetch',
//           '../@protobufjs/float',
//           '../@protobufjs/inquire',
//           '../@protobufjs/path',
//           '../@protobufjs/pool',
//           '../@protobufjs/utf8',
//           '../@types/node',
//           '../long'
//         ],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/protobufjs',
//         name: 'protobufjs',
//         version: '7.4.0',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/require-directory',
//         name: 'require-directory',
//         version: '2.1.1',
//         main: 'index.js',
//         required: false
//       },
//       {
//         dependencies: [
//           '../emoji-regex',
//           '../is-fullwidth-code-point',
//           '../strip-ansi'
//         ],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/string-width',
//         name: 'string-width',
//         version: '4.2.3',
//         main: '',
//         required: false
//       },
//       {
//         dependencies: [ '../ansi-regex' ],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/strip-ansi',
//         name: 'strip-ansi',
//         version: '6.0.1',
//         main: '',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/undici-types',
//         name: 'undici-types',
//         version: '6.19.8',
//         main: '',
//         required: false
//       },
//       {
//         dependencies: [ '../ansi-styles', '../string-width', '../strip-ansi' ],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/wrap-ansi',
//         name: 'wrap-ansi',
//         version: '7.0.0',
//         main: '',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/y18n',
//         name: 'y18n',
//         version: '5.0.8',
//         main: './build/index.cjs',
//         required: false
//       },
//       {
//         dependencies: [
//           '../cliui',
//           '../escalade',
//           '../get-caller-file',
//           '../require-directory',
//           '../string-width',
//           '../y18n',
//           '../yargs-parser'
//         ],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/yargs',
//         name: 'yargs',
//         version: '17.7.2',
//         main: './index.cjs',
//         required: false
//       },
//       {
//         dependencies: [],
//         path: '/home/sgimeno/nodesource/nsolid/test/common/nsolid-grpc-agent/node_modules/yargs-parser',
//         name: 'yargs-parser',
//         version: '21.1.1',
//         main: 'build/index.cjs',
//         required: false
//       }
//     ]
//   }
// },
//   metadata: {
//     'user-agent': [ 'grpc-c++/1.65.2 grpc-c/42.0.0 (linux; chttp2)' ],
//     'nsolid-agent-id': [ 'bfb0abf94bc01900281c6be9c8c3480032909614' ]
//   }

const expectedPackageNames = [
  '@grpc/grpc-js', '@grpc/proto-loader', '@js-sdsl/ordered-map', '@protobufjs/aspromise',
  '@protobufjs/base64', '@protobufjs/codegen', '@protobufjs/eventemitter', '@protobufjs/fetch',
  '@protobufjs/float', '@protobufjs/inquire', '@protobufjs/path', '@protobufjs/pool', '@protobufjs/utf8',
  '@types/node', 'ansi-regex', 'ansi-styles', 'cliui', 'color-convert', 'color-name', 'emoji-regex',
  'escalade', 'get-caller-file', 'is-fullwidth-code-point', 'lodash.camelcase', 'long', 'protobufjs',
  'require-directory', 'string-width', 'strip-ansi', 'undici-types', 'wrap-ansi', 'y18n', 'yargs',
  'yargs-parser',
];

function checkPackagesData(msg, metadata, requestId, agentId) {
  const packages = msg;
  assert.strictEqual(packages.common.requestId, requestId);
  assert.strictEqual(packages.common.command, 'packages');
  // From here check at least that all the fields are present
  assert.ok(packages.common.recorded);
  assert.ok(packages.common.recorded.seconds);
  assert.ok(packages.common.recorded.nanoseconds);
  assert.ok(packages.body);
  // also the body fields
  assert.ok(packages.body.packages);
  assert.ok(packages.body.packages.length);
  for (const pkg of packages.body.packages) {
    validateString(pkg.path, 'pkg.path');
    validateString(pkg.name, 'pkg.name');
    validateString(pkg.version, 'pkg.version');
    validateString(pkg.main, 'pkg.main');
    validateArray(pkg.dependencies, 'pkg.dependencies');
    validateBoolean(pkg.required, 'pkg.required');
    assert.strictEqual(pkg.required, false);
  }

  assert.ok(packages.body.packages.length <= expectedPackageNames.length);
  if (packages.body.packages.length < expectedPackageNames.length) {
    return false;
  }

  const packagesNames = packages.body.packages.map((pkg) => pkg.name);
  assertIncludes(packagesNames, expectedPackageNames);

  assert.ok(metadata['user-agent']);
  assert.ok(metadata['nsolid-agent-id']);
  assert.strictEqual(metadata['nsolid-agent-id'][0], agentId);

  return true;
}

function assertIncludes(actualValues, expectedValues) {
  for (const expectedValue of expectedValues) {
    assert.ok(actualValues.includes(expectedValue));
  }
}

async function runTest({ getEnv, nsolidConfig }) {
  return new Promise((resolve, reject) => {
    const grpcServer = new GRPCServer();
    grpcServer.start(mustSucceed(async (port) => {
      console.log('GRPC server started', port);
      const env = getEnv(port);
      const opts = {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env,
      };
      const child = new TestClient([], opts);
      const agentId = await child.id();
      const { data, requestId } = await grpcServer.packages(agentId);
      checkPackagesData(data.msg, data.metadata, requestId, agentId, nsolidConfig);
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
        NSOLID_GRPC_INSECURE: 1,
        NSOLID_GRPC: `localhost:${port}`
      };
    }
  }
];

for (const testConfig of testConfigs) {
  await runTest(testConfig);
  console.log('run test!');
}