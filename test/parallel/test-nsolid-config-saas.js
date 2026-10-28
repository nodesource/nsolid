'use strict';

const common = require('../common');
const assert = require('assert');
const nsolid = require('nsolid');
const spawn = require('child_process').spawn;

const PORT = 12345;
const saasToken =
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ.example.org:9001';
const saasCommand = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ.example.org:9001';
const invalidSaasToken = 'invalid.example.org:9001';

if (process.config.variables.asan)
  common.skip('incorrect leak reporting in curl.');

function execProc1() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child1' ],
                     {
                       env: {
                         NSOLID_COMMAND: PORT,
                         NSOLID_SAAS: saasToken
                       }
                     });
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', common.mustCall((code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.command, `localhost:${PORT}`);
    assert.strictEqual(config.saas, undefined);
  }));
}

function execProc2() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child1' ],
                     {
                       env: {
                         NSOLID_SAAS: saasToken
                       }
                     });
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', common.mustCall((code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.command, saasCommand);
    assert.strictEqual(config.saas, saasToken);
  }));
}

function execProc3() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child2' ],
                     {
                       env: {
                         NSOLID_COMMAND: PORT
                       }
                     });
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', common.mustCall((code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.command, undefined);
    assert.strictEqual(config.saas, saasToken);
  }));
}

function execProc4() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child3' ],
                     {
                       env: {
                         NSOLID_SAAS: saasToken
                       }
                     });
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', common.mustCall((code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.command, `localhost:${PORT}`);
    assert.strictEqual(config.saas, undefined);
  }));
}

function execProc5() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child4' ],
                     {
                       env: {
                         NSOLID_SAAS: saasToken,
                       }
                     });
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', common.mustCall((code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.first.command, `localhost:${PORT}`);
    assert.strictEqual(config.first.saas, undefined);
    assert.strictEqual(config.second.command, undefined);
    assert.strictEqual(config.second.saas, saasToken);
  }));
}

// NSOLID_COMMAND trumps NSOLID_SAAS, so the token should be ignored. It
// connects to both ZMQ and gRPC.
function execProc6() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child1' ],
                     {
                       env: {
                         NSOLID_COMMAND: PORT,
                         NSOLID_GRPC: PORT,
                         NSOLID_SAAS: saasToken
                       }
                     });
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', common.mustCall((code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.command, `localhost:${PORT}`);
    assert.strictEqual(config.grpc, `localhost:${PORT}`);
    assert.strictEqual(config.saas, undefined);
  }));
}

// If NSOLID_SAAS with NSOLID_GRPC, the token connects to SaaS using gRPC.
function execProc7() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child1' ],
                     {
                       env: {
                         NSOLID_SAAS: saasToken,
                         NSOLID_GRPC: PORT,
                       }
                     });
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', common.mustCall((code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.command, undefined);
    assert.strictEqual(config.grpc, `${PORT}`);
    assert.strictEqual(config.saas, saasToken);
  }));
}

function execProc8() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child1' ],
                     {
                       env: {
                         NSOLID_SAAS: invalidSaasToken
                       }
                     });
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', common.mustCall((code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.command, undefined);
    assert.strictEqual(config.saas, undefined);
  }));
}

function execProc9() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child1' ],
                     {
                       env: {
                         NSOLID_SAAS: invalidSaasToken,
                         NSOLID_GRPC: PORT,
                       }
                     });
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', common.mustCall((code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.command, undefined);
    assert.strictEqual(config.grpc, `localhost:${PORT}`);
    assert.strictEqual(config.saas, undefined);
  }));
}

function execProc10() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child5' ]);
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', common.mustCall((code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.command, undefined);
    assert.strictEqual(config.grpc, `localhost:${PORT}`);
    assert.strictEqual(config.saas, undefined);
  }));
}

function execProc11() {
  let output = '';
  const proc = spawn(process.execPath,
                     [ __filename, 'child6' ]);
  proc.stdout.on('data', (d) => {
    output += d;
  });

  proc.on('close', common.mustCall((code) => {
    assert.strictEqual(code, 0);
    const config = JSON.parse(output);
    assert.strictEqual(config.command, undefined);
    assert.strictEqual(config.grpc, `${PORT}`);
    assert.strictEqual(config.saas, saasToken);
  }));
}


switch (process.argv[2]) {
  case 'child1':
    process.stdout.write(JSON.stringify(nsolid.config));
    break;
  case 'child2':
    nsolid.start({
      saas: saasToken
    });
    process.stdout.write(JSON.stringify(nsolid.config));
    break;
  case 'child3':
    nsolid.start({
      command: PORT
    });
    process.stdout.write(JSON.stringify(nsolid.config));
    break;
  case 'child4':
    {
      const out = {};
      nsolid.start({
        command: PORT
      });
      out.first = nsolid.config;
      nsolid.start({
        saas: saasToken
      });
      out.second = nsolid.config;
      process.stdout.write(JSON.stringify(out));
    }
    break;
  case 'child5':
    nsolid.start({
      grpc: PORT,
      saas: invalidSaasToken
    });
    process.stdout.write(JSON.stringify(nsolid.config));
    break;
  case 'child6':
    nsolid.start({
      grpc: PORT,
      saas: saasToken
    });
    process.stdout.write(JSON.stringify(nsolid.config));
    break;
  default:
    execProc1();
    execProc2();
    execProc3();
    execProc4();
    execProc5();
    execProc6();
    execProc7();
    execProc8();
    execProc9();
    execProc10();
    execProc11();
}
