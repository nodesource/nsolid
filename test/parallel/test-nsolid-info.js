'use strict';

const common = require('../common');
const assert = require('assert');
const { spawn } = require('child_process');
const os = require('os');
const { resolve } = require('path');
const nsolid = require('nsolid');

// {
//   app: 'untitled application',
//   arch: 'x64',
//   cpuCores: 12,
//   cpuModel: 'Intel(R) Core(TM) i7-8750H CPU @ 2.20GHz',
//   execPath: '/home/sgimeno/nodesource/nsolid/out/Release/nsolid',
//   hostname: 'sgimeno-N8xxEZ',
//   id: '8318eafb0f363900c56b9f399e8db100a2d8f189',
//   main: '',
//   nodeEnv: 'prod',
//   pid: 22313,
//   platform: 'linux',
//   processStart: 1707905735857,
//   tags: [],
//   totalMem: 33359138816,
//   versions: {
//     acorn: '8.11.2',
//     ada: '2.7.4',
//     ares: '1.20.1',
//     base64: '0.5.1',
//     brotli: '1.0.9',
//     cjs_module_lexer: '1.2.2',
//     cldr: '43.1',
//     icu: '73.2',
//     llhttp: '8.1.1',
//     modules: '115',
//     napi: '9',
//     nghttp2: '1.58.0',
//     nghttp3: '0.7.0',
//     ngtcp2: '0.8.1',
//     node: '20.11.0',
//     nsolid: '5.0.5-pre',
//     openssl: '3.0.12+quic',
//     simdutf: '4.0.4',
//     tz: '2023c',
//     undici: '5.27.2',
//     unicode: '15.0',
//     uv: '1.46.0',
//     uvwasi: '0.0.19',
//     v8: '11.3.244.8-node.17',
//     zlib: '1.2.13.1-motley-5daffc7'
//   }
// }
if (process.argv[2]) {
  if (process.argv[3]) {
    process.title = process.argv[3];
  }

  nsolid.start();
  const info = nsolid.info();
  const cpuData = os.cpus();
  const totalMem = os.totalmem();
  const tags = process.env.NSOLID_TAGS ? process.env.NSOLID_TAGS.split(',').sort() : [];
  const appName = process.env.NSOLID_APP || process.argv[3] || 'untitled application';
  assert.strictEqual(info.app, appName);
  assert.strictEqual(info.arch, process.arch);
  assert.strictEqual(info.cpuCores, cpuData.length);
  assert.strictEqual(info.cpuModel, cpuData[0].model);
  assert.strictEqual(info.execPath, process.execPath);
  assert.strictEqual(info.hostname, os.hostname());
  assert.strictEqual(info.id.length, 40);
  assert.strictEqual(info.main, process.argv[1] ? resolve(process.argv[1]) : '');
  assert.strictEqual(info.nodeEnv, process.env.NODE_ENV || 'prod');
  assert.strictEqual(info.pid, process.pid);
  assert.strictEqual(info.platform, process.platform);
  assert.ok(info.processStart > process.uptime() * 1000);
  assert.deepStrictEqual(info.tags, tags);
  assert.strictEqual(info.totalMem, totalMem);
  assert.strictEqual(info.totalMem, os.totalmem());
  assert.deepStrictEqual(info.versions, process.versions);
} else {
  const env = {};
  const stdio = 'inherit';
  const cp1 = spawn(process.execPath, [ __filename, 'child' ], { env, stdio });
  cp1.on('exit', common.mustCall((code) => {
    assert.strictEqual(code, 0);
  }));

  env.NSOLID_APP = 'foo';
  env.NODE_ENV = 'dev';
  env.NSOLID_TAGS = 'foo,bar';
  const cp2 = spawn(process.execPath, [ __filename, 'child' ], { env, stdio });
  cp2.on('exit', common.mustCall((code) => {
    assert.strictEqual(code, 0);
  }));

  delete env.NSOLID_APP;
  const cp3 = spawn(process.execPath, [ __filename, 'child', 'my title' ], { env, stdio });
  cp3.on('exit', common.mustCall((code) => {
    assert.strictEqual(code, 0);
  }));
}
